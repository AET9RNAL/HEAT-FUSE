"""
TrajectoryAttentioner — AttnRes-inspired trajectory aggregation.

Replaces the fixed inverse-distance KNN blend with learned, per-time-bucket
attention weights drawn from the Attention Residuals architecture.

Formal mapping to the AttnRes paper:
  LLM layer l hidden state         →  Time bucket b of blended trajectory
  Fixed unit residual weight        →  Fixed 1/(dist+ε) KNN weight
  Learned query w_l ∈ R^d per layer →  Learned query q_b ∈ R^feat_dim per bucket
  α = softmax(w · RMSNorm(f))      →  α = softmax(q_b · RMSNorm(key_kb))

Total learned parameters: n_buckets × feat_dim (default 10×4 = 40 floats).
"""

import json
import math
import os


class TrajectoryAttentioner:
    """Per-time-bucket attention aggregation over KNN candidates."""

    def __init__(self, n_buckets=10, feat_dim=4, lr=0.02,
                 weights_file='saclos_attn_weights.json'):
        self.n_buckets = n_buckets
        self.feat_dim = feat_dim
        self.lr = lr
        self.weights_file = weights_file

        # Query vectors: one per bucket, each of dimension feat_dim
        # Initialized to uniform → replicates current KNN behavior exactly
        uniform_val = 1.0 / math.sqrt(feat_dim)
        self.queries = [[uniform_val] * feat_dim for _ in range(n_buckets)]

        # EMA baselines for REINFORCE variance reduction (one per bucket)
        self.baselines = [[0.0] * feat_dim for _ in range(n_buckets)]
        self.baseline_decay = 0.9

        # Tracking for gradient update
        self._last_keys = None       # list[bucket][candidate] of key vectors
        self._last_alphas = None     # list[bucket] of alpha vectors

        # Stats
        self.update_count = 0

        self._load()

    # ---- persistence ----

    def _weights_path(self):
        """Resolve weights file path inside data/ml/."""
        if os.path.isabs(self.weights_file):
            return self.weights_file
        from fuse.utils.paths import REPO_ROOT
        return str(REPO_ROOT / "data" / "ml" / self.weights_file)

    def _load(self):
        path = self._weights_path()
        if not os.path.exists(path):
            return
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            if 'queries' in data:
                self.queries = data['queries']
                self.n_buckets = len(self.queries)
                if self.queries:
                    self.feat_dim = len(self.queries[0])
            if 'baselines' in data:
                self.baselines = data['baselines']
            self.update_count = data.get('update_count', 0)
        except Exception:
            pass  # Fall back to uniform init

    def save(self):
        path = self._weights_path()
        try:
            data = {
                'queries': self.queries,
                'baselines': self.baselines,
                'update_count': self.update_count,
                'n_buckets': self.n_buckets,
                'feat_dim': self.feat_dim,
            }
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    # ---- core math ----

    @staticmethod
    def _rms_norm(vec):
        """RMSNorm: v / sqrt(mean(v^2) + eps)."""
        n = len(vec)
        if n == 0:
            return vec
        sq_sum = sum(x * x for x in vec)
        rms = math.sqrt(sq_sum / n + 1e-8)
        return [x / rms for x in vec]

    @staticmethod
    def _dot(a, b):
        return sum(x * y for x, y in zip(a, b))

    @staticmethod
    def _softmax(logits):
        if not logits:
            return []
        max_l = max(logits)
        exps = [math.exp(l - max_l) for l in logits]
        s = sum(exps)
        return [e / s for e in exps]

    def _bucketize_trajectory(self, traj, n_buckets):
        """
        Partition trajectory into n_buckets equal-time segments.

        Returns list of n_buckets sub-lists, each containing the points
        falling into that bucket.
        """
        if not traj:
            return [[] for _ in range(n_buckets)]

        duration = traj[-1]['t'] if traj[-1]['t'] > 0 else 1.0
        buckets = [[] for _ in range(n_buckets)]

        for pt in traj:
            b = int(pt['t'] / duration * n_buckets)
            b = min(b, n_buckets - 1)
            buckets[b].append(pt)

        return buckets

    def _make_key(self, bucket_points, bucket_idx, duration, range_m):
        """
        Build a feature key for one candidate's one bucket.

        key = RMSNorm([avg_dx, avg_dy, t_mid/duration, range/500])
        """
        if bucket_points:
            avg_dx = sum(p['dx'] for p in bucket_points) / len(bucket_points)
            avg_dy = sum(p['dy'] for p in bucket_points) / len(bucket_points)
        else:
            avg_dx = 0.0
            avg_dy = 0.0

        t_mid = (bucket_idx + 0.5) / self.n_buckets
        r_norm = range_m / 500.0

        raw = [avg_dx, avg_dy, t_mid, r_norm]
        return self._rms_norm(raw)

    # ---- public API ----

    def aggregate(self, candidates, query_disp, query_angle, range_m,
                  transform_func):
        """
        Attention-weighted aggregation over KNN candidates.

        Parameters
        ----------
        candidates     : list of sample dicts (the top-k hits)
        query_disp     : float — query displacement in px
        query_angle    : float — query angle in radians
        range_m        : float — target range in meters
        transform_func : callable(sample, disp, angle) → trajectory
                         (the existing _transform_traj method)

        Returns
        -------
        blended : list of {'t', 'dx', 'dy'} — the blended trajectory
        """
        if len(candidates) == 1:
            # Single candidate → no aggregation needed
            return transform_func(candidates[0], query_disp, query_angle)

        # Transform all candidates
        transformed = []
        for s in candidates:
            transformed.append(transform_func(s, query_disp, query_angle))

        # Use the first candidate's trajectory as the time template
        base_traj = transformed[0]
        n_pts = len(base_traj)

        # Bucketize each candidate
        k = len(candidates)
        candidate_buckets = []
        for ci in range(k):
            candidate_buckets.append(
                self._bucketize_trajectory(transformed[ci], self.n_buckets)
            )

        # Compute keys and attention weights per bucket
        all_keys = []    # [bucket][candidate] → key vector
        all_alphas = []  # [bucket] → alpha vector over candidates

        for b in range(self.n_buckets):
            keys_b = []
            for ci in range(k):
                dur = candidates[ci].get('dur', 1.0)
                r = candidates[ci].get('range', range_m)
                key = self._make_key(candidate_buckets[ci][b], b, dur, r)
                keys_b.append(key)

            # Compute attention logits: q_b · key_kb
            q = self.queries[b] if b < len(self.queries) else [0.0] * self.feat_dim
            logits = [self._dot(q, key) for key in keys_b]
            alphas = self._softmax(logits)

            all_keys.append(keys_b)
            all_alphas.append(alphas)

        # Store for gradient update
        self._last_keys = all_keys
        self._last_alphas = all_alphas

        # Blend trajectories per bucket
        blended = [{'t': base_traj[j]['t'], 'dx': 0.0, 'dy': 0.0}
                    for j in range(n_pts)]

        for b in range(self.n_buckets):
            # Determine which output points fall in this bucket
            duration = base_traj[-1]['t'] if base_traj[-1]['t'] > 0 else 1.0
            b_start = b / self.n_buckets * duration
            b_end = (b + 1) / self.n_buckets * duration

            for j in range(n_pts):
                t = base_traj[j]['t']
                if not (b_start <= t < b_end or (b == self.n_buckets - 1 and t >= b_start)):
                    continue

                for ci in range(k):
                    alpha = all_alphas[b][ci]
                    t_len = len(transformed[ci])
                    src_j = int(j * t_len / n_pts)
                    src_j = min(src_j, t_len - 1)
                    blended[j]['dx'] += alpha * transformed[ci][src_j]['dx']
                    blended[j]['dy'] += alpha * transformed[ci][src_j]['dy']

        return blended

    def update(self, reward, selected_keys=None):
        """
        REINFORCE gradient update on query vectors after an engagement.

        Parameters
        ----------
        reward        : float in [0, 1] — composite reward R = hit*(0.5 + λ*Q)
        selected_keys : optional override; defaults to self._last_keys
        """
        keys = selected_keys or self._last_keys
        if keys is None:
            return

        for b in range(min(self.n_buckets, len(keys))):
            if not keys[b]:
                continue

            # Weighted key for this bucket (attention-selected)
            alphas = self._last_alphas[b] if self._last_alphas else None
            if alphas is None:
                continue

            # Selected key = attention-weighted combination
            sel_key = [0.0] * self.feat_dim
            for ci, alpha in enumerate(alphas):
                for d in range(self.feat_dim):
                    sel_key[d] += alpha * keys[b][ci][d]

            # Update baseline (EMA)
            for d in range(self.feat_dim):
                self.baselines[b][d] = (
                    self.baseline_decay * self.baselines[b][d] +
                    (1 - self.baseline_decay) * sel_key[d]
                )

            # REINFORCE gradient: ∇q_b = R * (selected_key - baseline)
            # Decaying learning rate with confidence
            effective_lr = self.lr / (1.0 + 0.01 * self.update_count)

            for d in range(self.feat_dim):
                grad = reward * (sel_key[d] - self.baselines[b][d])
                self.queries[b][d] += effective_lr * grad

        self.update_count += 1
        self._last_keys = None
        self._last_alphas = None

        self.save()

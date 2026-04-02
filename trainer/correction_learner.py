"""
CorrectionLearner - KNN regression on human guidance data.

Stores human-guided missile correction trajectories and predicts via KNN
with miss-aware confidence, trajectory nudge, and label-directed corrections.
"""

import json
import math
import random


class CorrectionLearner:
    """Stores human-guided missile correction trajectories and predicts via KNN."""

    def __init__(self, data_file='saclos_ml_data.json', k=5):
        self.data_file = data_file
        self.k = k
        self.samples = []
        self._load()

    # ---- persistence (JSONL — one JSON object per line, append-only) ----

    def _load(self):
        try:
            with open(self.data_file, 'r') as f:
                content = f.read().strip()
                if not content:
                    self.samples = []
                    return

                try:
                    # Try to parse the entire file as a single JSON entity
                    data = json.loads(content)
                    if isinstance(data, dict) and 'samples' in data:
                        self.samples = data['samples']
                        self._rewrite_jsonl()
                        return
                    elif isinstance(data, list):
                        self.samples = data
                        self._rewrite_jsonl()
                        return
                    elif isinstance(data, dict):
                        self.samples = [data]
                        return
                except json.JSONDecodeError:
                    pass

                self.samples = []
                for line in content.split('\n'):
                    line = line.strip()
                    if line:
                        self.samples.append(json.loads(line))
        except FileNotFoundError:
            self.samples = []

    def _rewrite_jsonl(self):
        """Rewrite entire file as JSONL (used only for migration or --reset)."""
        with open(self.data_file, 'w') as f:
            for sample in self.samples:
                f.write(json.dumps(sample, separators=(',', ':')) + '\n')

    def _save_append(self, sample):
        """Append a single sample as one JSONL line — O(1) regardless of file size."""
        with open(self.data_file, 'a') as f:
            f.write(json.dumps(sample, separators=(',', ':')) + '\n')

    # ---- recording ----

    def add_sample(self, displacement_px, angle_rad, range_m,
                   trajectory, hit, miss_timing=None, miss_magnitude=None):
        """
        Add one manual-guidance sample with full mouse trajectory.

        trajectory: list of {'t': float, 'dx': int, 'dy': int}
                    where t is seconds since LMB click.
        miss_timing: 'premature'|'optimal'|'late' (misses only)
        miss_magnitude: 'undershoot'|'optimal'|'overshoot' (misses only)
        """
        total_dx = sum(p['dx'] for p in trajectory)
        total_dy = sum(p['dy'] for p in trajectory)
        duration = trajectory[-1]['t'] if trajectory else 0.0

        sample = {
            'disp':  round(displacement_px, 1),
            'angle': round(angle_rad, 4),
            'range': round(range_m, 1),
            'total_dx': total_dx,
            'total_dy': total_dy,
            'dur':   round(duration, 3),
            'traj':  trajectory,
            'hit':   hit,
        }
        if not hit:
            if miss_timing:
                sample['miss_timing'] = miss_timing
            if miss_magnitude:
                sample['miss_magnitude'] = miss_magnitude

        self.samples.append(sample)
        self._save_append(sample)
        return len(self.samples)

    # ---- helpers ----

    @staticmethod
    def _feature_vec(disp, range_m, angle_rad):
        D_SCALE = 300.0
        R_SCALE = 500.0
        return (
            disp / D_SCALE,
            range_m / R_SCALE,
            math.sin(angle_rad),
            math.cos(angle_rad),
        )

    @staticmethod
    def _feat_dist(a, b):
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    def _transform_traj(self, sample, query_disp, query_angle):
        """Scale + rotate a sample's trajectory to match query displacement/angle."""
        base_disp = sample['disp']
        scale = (query_disp / base_disp) if base_disp > 0 else 1.0
        scale = max(0.3, min(scale, 3.0))

        angle_diff = query_angle - sample['angle']
        cos_a = math.cos(angle_diff)
        sin_a = math.sin(angle_diff)

        out = []
        for pt in sample['traj']:
            rdx = pt['dx'] * cos_a - pt['dy'] * sin_a
            rdy = pt['dx'] * sin_a + pt['dy'] * cos_a
            out.append({'t': pt['t'], 'dx': rdx * scale, 'dy': rdy * scale})
        return out

    # ---- prediction ----

    def predict(self, displacement_px, angle_rad, range_m):
        """
        K-NN prediction with miss-aware confidence and trajectory nudge.

        Returns (trajectory, confidence) or (None, 0.0).
        """
        hits   = [s for s in self.samples if s['hit'] and s.get('traj')]
        misses = [s for s in self.samples if not s['hit'] and s.get('traj')]

        if len(hits) < 3:
            return None, 0.0

        query_feat = self._feature_vec(displacement_px, range_m, angle_rad)

        hit_dists = []
        for i, s in enumerate(hits):
            d = self._feat_dist(query_feat,
                    self._feature_vec(s['disp'], s['range'], s['angle']))
            hit_dists.append((d, i))
        hit_dists.sort()

        miss_dists = []
        for i, s in enumerate(misses):
            d = self._feat_dist(query_feat,
                    self._feature_vec(s['disp'], s['range'], s['angle']))
            miss_dists.append((d, i))
        miss_dists.sort()

        # 1. K-NN weighted-average trajectory (inverse-distance)
        k = min(self.k, len(hits))
        top_k = hit_dists[:k]

        EPS = 1e-6
        weights = [1.0 / (d + EPS) for d, _ in top_k]
        w_sum   = sum(weights)

        base_traj = hits[top_k[0][1]]['traj']
        n_pts     = len(base_traj)

        blended = [{'t': base_traj[j]['t'], 'dx': 0.0, 'dy': 0.0}
                    for j in range(n_pts)]

        for wi, (_, idx) in zip(weights, top_k):
            transformed = self._transform_traj(
                hits[idx], displacement_px, angle_rad)
            t_len = len(transformed)
            for j in range(n_pts):
                src_j = int(j * t_len / n_pts)
                src_j = min(src_j, t_len - 1)
                blended[j]['dx'] += wi / w_sum * transformed[src_j]['dx']
                blended[j]['dy'] += wi / w_sum * transformed[src_j]['dy']

        # 2. Miss-repelled trajectory nudge
        MISS_RADIUS = 0.35
        NUDGE_STRENGTH = 0.3

        nearby_misses = [(d, i) for d, i in miss_dists if d < MISS_RADIUS]

        if nearby_misses:
            pred_total_dx = sum(p['dx'] for p in blended)
            pred_total_dy = sum(p['dy'] for p in blended)

            miss_wx = 0.0
            miss_wy = 0.0
            miss_wt = 0.0
            for d, idx in nearby_misses:
                mw = 1.0 / (d + EPS)
                mt = self._transform_traj(
                    misses[idx], displacement_px, angle_rad)
                miss_wx += mw * sum(p['dx'] for p in mt)
                miss_wy += mw * sum(p['dy'] for p in mt)
                miss_wt += mw

            if miss_wt > 0:
                miss_avg_dx = miss_wx / miss_wt
                miss_avg_dy = miss_wy / miss_wt

                nudge_dx = (pred_total_dx - miss_avg_dx) * NUDGE_STRENGTH
                nudge_dy = (pred_total_dy - miss_avg_dy) * NUDGE_STRENGTH

                if n_pts > 0:
                    for j in range(n_pts):
                        blended[j]['dx'] += nudge_dx / n_pts
                        blended[j]['dy'] += nudge_dy / n_pts

        # 3. Label-directed correction / exploration fallback
        nearby_hits_count = sum(1 for d, _ in hit_dists if d < MISS_RADIUS)
        nearby_miss_count = len(nearby_misses)

        labeled_misses = [(d, i) for d, i in nearby_misses
                          if misses[i].get('miss_timing') or misses[i].get('miss_magnitude')]

        if labeled_misses and n_pts > 0:
            timing_weights = []
            for d, idx in labeled_misses:
                timing = misses[idx].get('miss_timing')
                if timing and timing != 'optimal':
                    w = 1.0 / (d + EPS)
                    factor = 1.20 if timing == 'premature' else 0.80
                    timing_weights.append((w, factor))

            if timing_weights:
                total_w = sum(w for w, _ in timing_weights)
                timing_factor = sum(w * f for w, f in timing_weights) / total_w
                timing_factor = max(0.5, min(timing_factor, 2.0))
                for j in range(n_pts):
                    blended[j]['t'] *= timing_factor

            mag_weights = []
            for d, idx in labeled_misses:
                magnitude = misses[idx].get('miss_magnitude')
                if magnitude and magnitude != 'optimal':
                    w = 1.0 / (d + EPS)
                    factor = 0.82 if magnitude == 'overshoot' else 1.18
                    mag_weights.append((w, factor))

            if mag_weights:
                total_w = sum(w for w, _ in mag_weights)
                mag_factor = sum(w * f for w, f in mag_weights) / total_w
                mag_factor = max(0.5, min(mag_factor, 2.0))
                for j in range(n_pts):
                    blended[j]['dx'] *= mag_factor
                    blended[j]['dy'] *= mag_factor

        elif nearby_miss_count > nearby_hits_count and n_pts > 0:
            miss_ratio = nearby_miss_count / (nearby_miss_count + nearby_hits_count + EPS)
            pred_total_dx = sum(p['dx'] for p in blended)
            pred_total_dy = sum(p['dy'] for p in blended)
            pred_len = math.sqrt(pred_total_dx**2 + pred_total_dy**2) + EPS
            explore_mag = pred_len * 0.15 * miss_ratio

            theta = random.uniform(0, 2 * math.pi)
            explore_dx = explore_mag * math.cos(theta)
            explore_dy = explore_mag * math.sin(theta)

            for j in range(n_pts):
                blended[j]['dx'] += explore_dx / n_pts
                blended[j]['dy'] += explore_dy / n_pts

        # 4. Confidence (informational)
        best_hit_dist = hit_dists[0][0]

        sample_factor    = min(1.0, len(hits) / 20.0)
        proximity_factor = max(0.0, 1.0 - best_hit_dist * 2.0)

        miss_penalty = 1.0
        if miss_dists:
            nearest_miss_dist = miss_dists[0][0]
            if nearest_miss_dist < best_hit_dist:
                miss_penalty = 0.2 + 0.3 * (nearest_miss_dist / (best_hit_dist + EPS))
                miss_penalty = min(miss_penalty, 1.0)
            elif nearest_miss_dist < MISS_RADIUS:
                miss_penalty = 0.7 + 0.3 * (nearest_miss_dist / MISS_RADIUS)

        confidence = sample_factor * proximity_factor * miss_penalty

        return blended, confidence

    # ---- stats ----

    def get_stats(self):
        total = len(self.samples)
        hits  = sum(1 for s in self.samples if s['hit'])
        misses = total - hits
        labeled = sum(1 for s in self.samples
                      if not s['hit'] and (s.get('miss_timing') or s.get('miss_magnitude')))
        return {'total': total, 'hits': hits, 'misses': misses, 'labeled_misses': labeled}

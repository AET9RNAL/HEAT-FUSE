import logoReveal from '../assets/logoReveal.webm?url'

const MAX_WAIT_MS = 5_000

let finished = false
function finish() {
  if (finished) return
  finished = true
  window.splashAPI?.done()
}

const video = document.createElement('video')
video.id = 'splash-video'
video.src = logoReveal
video.muted = true
video.autoplay = true
video.playsInline = true
video.controls = false
video.disablePictureInPicture = true

video.addEventListener('ended', finish)
video.addEventListener('error', finish)
document.body.appendChild(video)

setTimeout(finish, MAX_WAIT_MS)

// Autoplay can still be refused; play() rejection means no animation to wait for.
void video.play().catch(finish)

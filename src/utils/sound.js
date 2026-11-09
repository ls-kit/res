let isUnlocked = false

export function playSound(type = 'click') {
  try {
    // ব্রাউজারের অটো-প্লে পলিসি আনলক করা (প্রথম ক্লিকে নীরবে প্লে হবে)
    if (!isUnlocked) {
      const unlockAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3')
      unlockAudio.volume = 0
      unlockAudio.play().catch(() => {})
      isUnlocked = true
    }

    const url = type === 'delete' 
      ? 'https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3' 
      : 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
      
    const audio = new Audio(url)
    audio.volume = 0.4
    audio.play().catch(() => {})
    
    if (navigator.vibrate) {
      navigator.vibrate(type === 'delete' ? [40, 40, 40] : 30)
    }
  } catch (e) {}
}
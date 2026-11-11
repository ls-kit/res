<script setup>
import { ref, onUnmounted } from 'vue'
import { playSound } from '../utils/sound'

const props = defineProps({ id: { type: [String, Number], required: true } })
const emit = defineEmits(['delete'])

const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const isSwiping = ref(false)
const isHorizontalSwipe = ref(null)

function onStart(e) {
  // 🔥 যদি ইনপুট বা বাটনে ক্লিক করে, তবে সোয়ার্প বাতিল করব
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return
  
  startX.value = e.touches ? e.touches[0].clientX : e.clientX
  startY.value = e.touches ? e.touches[0].clientY : e.clientY
  isSwiping.value = true
  currentX.value = 0
  isHorizontalSwipe.value = null
}

function onMove(e) {
  if (!isSwiping.value) return
  const x = e.touches ? e.touches[0].clientX : e.clientX
  const y = e.touches ? e.touches[0].clientY : e.clientY
  const diffX = startX.value - x
  const diffY = startY.value - y

  // দিক শনাক্তকরণ (স্ক্রল নাকি সোয়ার্প)
  if (isHorizontalSwipe.value === null) {
    if (Math.abs(diffX) > Math.abs(diffY)) {
      isHorizontalSwipe.value = true
    } else {
      isHorizontalSwipe.value = false
      isSwiping.value = false
      return
    }
  }

  if (isHorizontalSwipe.value === true) {
    if (diffX > 0) {
      if (e.cancelable) e.preventDefault()
      currentX.value = diffX
    }
  }
}

function onEnd() {
  if (!isSwiping.value) return
  isSwiping.value = false
  
  if (isHorizontalSwipe.value === true && currentX.value > 70) {
    playSound('delete')
    currentX.value = 0
    emit('delete', props.id) // 🔥 প্যারেন্টে ডিলিট ইভেন্ট পাঠানো
  } else {
    currentX.value = 0
  }
  isHorizontalSwipe.value = null
}

onUnmounted(() => {})
</script>

<template>
  <div class="relative overflow-hidden w-full group touch-pan-y border-b border-slate-100 last:border-0">
    <div class="absolute inset-0 bg-red-500 flex items-center justify-end pr-4 text-white z-0">
      <span class="text-[18px]">🗑️ ডিলিট</span>
    </div>

    <div 
      class="relative z-10 transition-transform duration-200 ease-out bg-white"
      :style="{ 
        transform: `translateX(-${currentX}px)`,
        transitionDuration: isSwiping ? '0ms' : '250ms',
        opacity: currentX > 70 ? 0.5 : 1
      }"
      @touchstart="onStart"
      @touchmove="onMove"
      @touchend="onEnd"
      @mousedown="onStart"
      @mousemove="onMove"
      @mouseup="onEnd"
      @mouseleave="onEnd"
    >
      <slot></slot>
    </div>

    <div class="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex bg-white">
      <button 
        @click="playSound('delete'); emit('delete', id);" 
        class="w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-sm font-bold active:scale-90"
      >
        ✕
      </button>
    </div>
  </div>
</template>
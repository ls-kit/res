import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 🔥 গ্লোবাল কাস্টম ডিরেক্টিভ (Select All on Focus)
app.directive('select-on-focus', {
  mounted(el) {
    let isFirstClick = true

    el.addEventListener('focus', () => {
      if (isFirstClick) {
        // টেক্সট সিলেক্ট করার ট্রিক (number ইনপুটের জন্য)
        if (el.type === 'number') {
          const originalType = el.type
          el.type = 'text'
          el.select()
          setTimeout(() => { el.type = originalType }, 10)
        } else {
          el.select()
        }
      }
    })

    el.addEventListener('mouseup', (e) => {
      // যদি প্রথম ক্লিক হয় এবং ইনপুট ফোকাসড থাকে
      if (isFirstClick) {
        e.preventDefault() // কার্সর শেষে যাওয়া ব্লক করব
        isFirstClick = false // পরের ক্লিকের জন্য ফ্ল্যাগ false করে দেব
      }
    })

    el.addEventListener('blur', () => {
      // ফোকাস চলে গেলে আবার প্রথম ক্লিকের জন্য প্রস্তুত করব
      isFirstClick = true
    })
  }
})

app.use(router).mount('#app')
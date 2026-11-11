<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

import { supabase } from './supabase' // উপরে ইমপোর্ট করুন

const restaurantName = ref('')

onMounted(async () => {
  await fetchProfile()
  
  // 🔥 স্ট্যাটাস চেক লজিক
  if (profile.value?.restaurant_id) {
    const { data } = await supabase.from('restaurants').select('name, status').eq('id', profile.value.restaurant_id).single()
    
    if (data) {
      restaurantName.value = data.name
      
      // যদি রেস্টুরেন্ট নিষ্ক্রিয় থাকে
      if (data.status === 'inactive') {
        await logout()
        localStorage.clear()
        alert('আপনার রেস্টুরেন্টটি সাময়িকভাবে বন্ধ করা হয়েছে। সাপোর্টে যোগাযোগ করুন।')
        router.push('/login')
      }
    }
  }
})

function exitRestaurant() {
  localStorage.removeItem('viewing_restaurant_id')
  localStorage.removeItem('viewing_restaurant_name')
  viewingRestaurantName.value = null
  router.push('/superadmin')
}

const route = useRoute()
const router = useRouter()
const { profile, logout, fetchProfile } = useAuth()
const showMenu = ref(false)

const viewingRestaurantName = ref(localStorage.getItem('viewing_restaurant_name'))

const tabs = [
  { name: 'input', path: '/', label: 'নতুন এন্ট্রি', icon: '✚' },
  { name: 'today', path: '/today', label: 'আজকের', icon: '🧾' },
  { name: 'items', path: '/items', label: 'তালিকা', icon: '📦' }
]

const titles = {
  input: { main: 'ক্রয় এন্ট্রি', sub: 'সঠিক হিসাব, বেশি লাভ' },
  today: { main: 'দৈনিক মেমো', sub: 'আজকের কেনাকাটা' },
  items: { main: 'মাস্টার লিস্ট', sub: 'পণ্য ও সাপ্লায়ার' },
  team: { main: 'টিম ম্যানেজমেন্ট', sub: 'কর্মী যোগ করুন' },
  superadmin: { main: 'সুপার অ্যাডমিন', sub: 'সব রেস্টুরেন্ট' },
  dashboard: { main: 'ড্যাশবোর্ড', sub: 'ব্যবসার সার্বিক অবস্থা' },
  report: { main: 'রিপোর্ট', sub: 'ব্যবসার সম্পূর্ণ অ্যানালাইসিস' },
  'cost-control': { main: 'কস্ট কন্ট্রোল', sub: 'খরচ ও দাম বিশ্লেষণ' }
  
}

function goTo(path) {
  router.push(path)
  showMenu.value = false
}

async function handleLogout() {
  await logout()
  router.push('/login')
}

onMounted(async () => {
  await fetchProfile()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#f4f7fb]">
    
    <header class="sticky top-0 z-30 bg-[#0b172a] text-white shadow-md">
      <div class="pt-safe px-4 pb-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button @click="showMenu = true" class="text-2xl leading-none active:scale-90 transition">☰</button>
          
          <div class="flex items-center gap-1.5">
            <span class="text-2xl">👨‍🍳</span>
            <div>
              <p class="text-[17px] font-bold leading-none tracking-wide text-emerald-400">RCR</p>
              <p class="text-[9px] text-white/70 leading-none mt-0.5">Restaurant Cost Reducer</p>
              <p class="text-[10px] text-white font-medium mt-0.5 truncate max-w-[120px]">
                {{ restaurantName || 'Restaurant Cost Reducer' }}
              </p>
            </div>
          </div>

        </div>
        
        <div class="text-center">
          <p class="text-[16px] font-bold leading-none">{{ titles[route.name]?.main || 'RCR' }}</p>
          <p class="text-[11px] text-white/70 mt-1">{{ titles[route.name]?.sub || '' }}</p>
        </div>


      <div v-if="viewingRestaurantName" class="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 flex justify-between items-center">
        <span>👀 দেখা হচ্ছে: {{ viewingRestaurantName }}</span>
        <button @click="exitRestaurant" class="bg-amber-600 text-white px-2 py-0.5 rounded text-[10px]">ফিরে যান</button>
      </div>

        <div class="relative">
          <span class="text-xl">🔔</span>
        </div>
      </div>
    </header>

    <main class="flex-1 pb-24">
      <router-view />
    </main>

    <!-- Hide bottom nav on login page -->
    <!-- Premium Bottom Navigation -->
    <nav v-if="route.name !== 'login'" class="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
      <div class="grid grid-cols-5 px-1 pb-2">
        <button
          @click="router.push('/dashboard')"
          class="flex flex-col items-center justify-center gap-0 pb-0 text-[10px] transition select-none relative"
          :class="route.name === 'dashboard' ? 'text-[#0b172a] font-bold' : 'text-slate-400'"
        >
          <div class="p-0.5 rounded-xl transition-all duration-300" :class="route.name === 'dashboard' ? 'bg-blue-50' : ''">
            <svg class="w-5 h-5" :class="route.name === 'dashboard' ? 'text-blue-600' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
          </div>
          <span>ড্যাশবোর্ড</span>
        </button>

        <button
          @click="router.push('/today')"
          class="flex flex-col items-center justify-center gap-0 pb-0 text-[10px] transition select-none relative"
          :class="route.name === 'today' ? 'text-[#0b172a] font-bold' : 'text-slate-400'"
        >
          <div class="p-0.5 rounded-xl transition-all duration-300" :class="route.name === 'today' ? 'bg-blue-50' : ''">
            <svg class="w-5 h-5" :class="route.name === 'today' ? 'text-blue-600' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
          </div>
          <span>আজকের</span>
        </button>

        <!-- Floating Center Button for New Input -->
        <div class="relative flex justify-center -top-5">
          <button
            @click="router.push('/')"
            class="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-[0_4px_15px_rgba(16,185,129,0.4)] border-4 border-white active:scale-95 transition-transform"
          >
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>

        <button
          @click="router.push('/purchase-plan')"
          class="flex flex-col items-center justify-center gap-0 pb-0 text-[10px] transition select-none relative"
          :class="route.name === 'purchase-plan' ? 'text-[#0b172a] font-bold' : 'text-slate-400'"
        >
          <div class="p-0.5 rounded-xl transition-all duration-300" :class="route.name === 'items' ? 'bg-blue-50' : ''">
            🛒
          </div>
          <span>পরিকল্পনা</span>
        </button>



        <button
          @click="showMenu = true"
          class="flex flex-col items-center justify-center gap-0 pb-0 text-[10px] text-slate-400 transition select-none"
        >
          <div class="p-0.5 rounded-xl">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          </div>
          <span>মেনু</span>
        </button>
      </div>
    </nav>

    <!-- Side Menu -->
    <div v-if="showMenu" class="fixed inset-0 z-50 flex">
      <div @click="showMenu = false" class="absolute inset-0 bg-black/50 transition-opacity"></div>
      
      <div class="relative w-[75%] max-w-[300px] bg-white h-full shadow-2xl flex flex-col transform transition-transform">
        <div class="p-4 bg-[#0b172a] text-white pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xl font-bold text-emerald-400">RCR</span>
            <button @click="showMenu = false" class="text-xl text-white/70">✕</button>
          </div>
          <p class="text-sm font-bold text-white">{{ profile?.name || 'ইউজার' }}</p>
          <p class="text-xs text-white/60">{{ profile?.role === 'superadmin' ? 'সুপার অ্যাডমিন' : profile?.role === 'admin' ? 'মালিক' : 'কর্মী' }}</p>
        </div>
        
        <div class="flex-1 py-2 overflow-y-auto">
          <!-- <button @click="goTo('/')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'input' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">✚</span> নতুন ক্রয় এন্ট্রি
          </button> -->
          <button @click="goTo('/today')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'today' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">🧾</span> আজকের মেমো
          </button>
          <button @click="goTo('/purchase-plan')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'purchase-plan' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">🛒</span> বাজার পরিকল্পনা
          </button>
          <button @click="goTo('/items')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'items' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">📦</span> পণ্য ও সাপ্লায়ার
          </button>
          <button @click="goTo('/dashboard')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'dashboard' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">📊</span> ড্যাশবোর্ড
          </button>
          <button @click="goTo('/report')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'report' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">📈</span> রিপোর্ট 
          </button>
          <button @click="goTo('/cost-control')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'cost-control' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">⚖️</span> কস্ট কন্ট্রোল
          </button>


          <div class="border-t border-slate-200 my-2" v-if="profile?.role === 'admin' || profile?.role === 'superadmin'"></div>

          <button v-if="profile?.role === 'admin' || profile?.role === 'superadmin'" @click="goTo('/team')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'team' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">👥</span> টিম ম্যানেজমেন্ট
          </button>
          
          <button v-if="profile?.role === 'superadmin'" @click="goTo('/superadmin')" class="w-full text-left px-5 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 font-medium" :class="route.name === 'superadmin' ? 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-500' : ''">
            <span class="text-lg">🌐</span> সব রেস্টুরেন্ট
          </button>
        </div>

        <div class="p-4 border-t border-slate-200">
          <button @click="handleLogout" class="w-full py-2 bg-red-50 text-red-600 font-bold rounded-lg text-sm">লগআউট</button>
        </div>
      </div>
    </div>
  </div>
</template>
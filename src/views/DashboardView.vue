<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'
import { useRouter } from 'vue-router'

const router = useRouter()
const { profile } = useAuth()

const loading = ref(true)
const purchases = ref([])
const activeTab = ref('overview') // 'overview' | 'report'

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)
}

async function loadData() {
  if (!profile.value) {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (profile.value) { clearInterval(check); resolve() }
      }, 100)
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
  }

  const rid = getActiveRestaurantId()
  if (!rid) { loading.value = false; return }

  const firstDay = new Date()
  firstDay.setDate(1)
  
  const { data } = await supabase
    .from('purchases')
    .select('*')
    .eq('restaurant_id', rid)
    .gte('purchase_date', firstDay.toISOString().slice(0, 10))
    .order('created_at', { ascending: false })

  purchases.value = data || []
  loading.value = false
}

/* --- Computeds --- */
const todayStr = new Date().toISOString().slice(0, 10)
const currentDay = new Date().getDate()
const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()

const todayTotal = computed(() => purchases.value.filter(p => p.purchase_date === todayStr).reduce((s, p) => s + Number(p.total_price), 0))
const monthTotal = computed(() => purchases.value.reduce((s, p) => s + Number(p.total_price), 0))

// সাশ্রয়ের হিসাব (ম্যানুয়ালি দাম কমানো)
const totalSavings = computed(() => {
  let savings = 0
  purchases.value.forEach(p => {
    const q = Number(p.quantity) || 0
    const up = Number(p.unit_price) || 0
    const total = Number(p.total_price) || 0
    const expected = q * up
    if (expected - total > 1) savings += (expected - total)
  })
  return savings
})

// মাস শেষে সম্ভাব্য খরচ (Forecast)
const forecast = computed(() => {
  if (monthTotal.value === 0) return 0
  const avgPerDay = monthTotal.value / currentDay
  return Math.round(avgPerDay * daysInMonth)
})

// লাইন চার্টের জন্য ডেটা
const chartPoints = computed(() => {
  const map = {}
  // ১ থেকে ৩১ তারিখ পর্যন্ত অ্যারে তৈরি
  for (let i = 1; i <= currentDay; i++) {
    const d = new Date()
    d.setDate(i)
    map[d.toISOString().slice(0, 10)] = 0
  }
  
  purchases.value.forEach(p => {
    if (map[p.purchase_date] !== undefined) {
      map[p.purchase_date] += Number(p.total_price)
    }
  })

  const amounts = Object.values(map)
  const max = Math.max(...amounts, 1) // ০ ডিভিশন এরর এড়াতে
  
  // SVG পয়েন্ট জেনারেট
  const width = 300
  const height = 100
  const step = width / (amounts.length - 1 || 1)
  
  return amounts.map((amt, i) => {
    const x = i * step
    const y = height - ((amt / max) * height * 0.8) // ৮০% হাইট ব্যবহার
    return { x, y, amt }
  })
})

const linePath = computed(() => {
  if (chartPoints.value.length === 0) return ''
  return chartPoints.value.reduce((path, point, i) => {
    return path + (i === 0 ? `M ${point.x},${point.y}` : ` L ${point.x},${point.y}`)
  }, '')
})

// ডোনাট চার্টের জন্য ডেটা (সাপ্লায়ার ভিত্তিক)
const donutData = computed(() => {
  const map = {}
  purchases.value.forEach(p => {
    const sup = p.supplier || 'অন্যান্য'
    if (!map[sup]) map[sup] = 0
    map[sup] += Number(p.total_price)
  })
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const total = sorted.reduce((s, i) => s + i[1], 0)
  
  const colors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6']
  let currentAngle = 0
  let gradient = ''

  const items = sorted.map(([name, amt], i) => {
    const percent = (amt / total) * 100
    const angle = (amt / total) * 360
    gradient += `${colors[i]} ${currentAngle}deg ${currentAngle + angle}deg, `
    currentAngle += angle
    return { name, amt, percent: Math.round(percent), color: colors[i] }
  })

  return { gradient: gradient.slice(0, -2), items, total }
})

onMounted(loadData)
</script>

<template>
  <div class="px-3 pt-3 pb-6 space-y-4 bg-[#f4f7fb] min-h-screen">
    
    <!-- TABS -->
    <div class="grid grid-cols-2 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
      <button @click="activeTab = 'overview'" class="h-9 rounded-lg text-[12px] font-bold transition" :class="activeTab === 'overview' ? 'bg-[#0b172a] text-white' : 'text-slate-600'">ওভারভিউ</button>
      <button @click="activeTab = 'report'" class="h-9 rounded-lg text-[12px] font-bold transition" :class="activeTab === 'report' ? 'bg-[#0b172a] text-white' : 'text-slate-600'">বিশ্লেষণ</button>
    </div>

    <div v-if="loading" class="text-center text-slate-400 py-10 text-sm">লোড হচ্ছে...</div>

    <div v-else class="space-y-4">
      
      <!-- ================= OVERVIEW TAB ================= -->
      <template v-if="activeTab === 'overview'">
        
        <!-- Restaurant Info -->
        <div class="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100">
          <div class="flex items-center gap-2">
            <div class="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-xl">🍽️</div>
            <div>
              <p class="text-[13px] font-bold text-slate-800">{{ profile?.name || 'আমার রেস্টুরেন্ট' }}</p>
              <p class="text-[10px] text-slate-500">Premium Plan</p>
            </div>
          </div>
          <button class="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 text-[11px] font-bold bg-blue-50 active:scale-95">Switch ⇄</button>
        </div>

        <!-- KPI Cards (2x2) -->
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-blue-50/50 border border-blue-100 rounded-xl p-3 shadow-sm relative overflow-hidden">
            <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">🛒</div>
            <p class="text-[10px] text-slate-600 font-medium">আজকের ক্রয়</p>
            <p class="text-[18px] font-bold text-slate-800 mt-1">৳ {{ fmt(todayTotal) }}</p>
          </div>
          <div class="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 shadow-sm relative overflow-hidden">
            <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">📈</div>
            <p class="text-[10px] text-slate-600 font-medium">এই মাসের ক্রয়</p>
            <p class="text-[18px] font-bold text-slate-800 mt-1">৳ {{ fmt(monthTotal) }}</p>
          </div>
          <div class="bg-amber-50/50 border border-amber-100 rounded-xl p-3 shadow-sm relative overflow-hidden">
            <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">💰</div>
            <p class="text-[10px] text-amber-700 font-medium">সাশ্রয়ের সুযোগ</p>
            <p class="text-[18px] font-bold text-amber-800 mt-1">৳ {{ fmt(totalSavings) }}</p>
          </div>
          <div class="bg-purple-50/50 border border-purple-100 rounded-xl p-3 shadow-sm relative overflow-hidden">
            <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">🛡️</div>
            <p class="text-[10px] text-purple-700 font-medium">অনুমোদন অপেক্ষায়</p>
            <p class="text-[18px] font-bold text-purple-800 mt-1">০ টি</p>
          </div>
        </div>

        <!-- Premium Line Chart -->
        <div class="bg-[#0b172a] rounded-xl p-4 shadow-lg text-white relative overflow-hidden">
          <div class="flex justify-between items-center mb-4">
            <p class="text-[12px] font-bold text-white/90">মাসিক ক্রয়ের সারাংশ</p>
            <button class="bg-white/10 px-2 py-1 rounded text-[10px]">এই মাস</button>
          </div>
          
          <div class="relative h-[120px] w-full">
            <!-- SVG Chart -->
            <svg viewBox="0 0 300 100" class="w-full h-full overflow-visible" preserveAspectRatio="none">
              <!-- Gradient under the line -->
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5" />
                  <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
                </linearGradient>
              </defs>
              <!-- Area -->
              <path :d="`${linePath} L 300,100 L 0,100 Z`" fill="url(#grad)" />
              <!-- Line -->
              <path :d="linePath" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <div class="flex justify-between text-[9px] text-white/50 mt-2">
            <span>১ তারিখ</span>
            <span>১৫ তারিখ</span>
            <span>আজ ({{ currentDay }} তারিখ)</span>
          </div>
          
          <!-- Tooltip equivalent (Static display for simplicity) -->
          <div class="absolute top-1/2 right-4 bg-white text-slate-800 rounded px-2 py-1 text-[10px] font-bold shadow-lg transform -translate-y-1/2">
            ৳ {{ fmt(monthTotal) }}
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-4 gap-2">
          <button @click="router.push('/today')" class="bg-white rounded-xl p-2 flex flex-col items-center justify-center shadow-sm border border-slate-100 active:scale-95">
            <span class="text-xl mb-1">🧾</span>
            <span class="text-[10px] font-bold text-slate-700">মেমো</span>
          </button>
          <button class="bg-white rounded-xl p-2 flex flex-col items-center justify-center shadow-sm border border-slate-100 active:scale-95">
            <span class="text-xl mb-1">✅</span>
            <span class="text-[10px] font-bold text-slate-700">অনুমোদন</span>
          </button>
          <button @click="router.push('/items')" class="bg-white rounded-xl p-2 flex flex-col items-center justify-center shadow-sm border border-slate-100 active:scale-95">
            <span class="text-xl mb-1">⚖️</span>
            <span class="text-[10px] font-bold text-slate-700">দাম তুলনা</span>
          </button>
          <button @click="activeTab = 'report'" class="bg-white rounded-xl p-2 flex flex-col items-center justify-center shadow-sm border border-slate-100 active:scale-95">
            <span class="text-xl mb-1">📊</span>
            <span class="text-[10px] font-bold text-slate-700">রিপোর্ট</span>
          </button>
        </div>

        <!-- Recent Weekly List -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="px-3 py-2 border-b border-slate-100 flex justify-between items-center">
            <p class="text-[12px] font-bold text-slate-800">সাম্প্রতিক ক্রয়</p>
            <button @click="router.push('/today')" class="text-[11px] text-blue-600 font-bold">সব দেখুন ›</button>
          </div>
          <div class="divide-y divide-slate-50">
            <div v-for="p in purchases.slice(0, 3)" :key="p.id" class="p-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg">📦</div>
                <div>
                  <p class="text-[13px] font-bold text-slate-800">{{ p.supplier || 'সাপ্লায়ার' }}</p>
                  <p class="text-[10px] text-slate-500">{{ p.item_name }}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-[13px] font-bold text-slate-800">৳ {{ fmt(p.total_price) }}</p>
                <p class="text-[10px] text-emerald-600 font-medium">সম্পন্ন</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ================= REPORT TAB ================= -->
      <template v-if="activeTab === 'report'">
        
        <!-- Top Trophy Section -->
        <div class="bg-gradient-to-br from-emerald-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200 flex items-center justify-between">
          <div>
            <p class="text-[12px] font-bold text-green-800">এই মাসে আপনার সাশ্রয়</p>
            <p class="text-[24px] font-bold text-green-900 mt-1">৳ {{ fmt(totalSavings) }}</p>
            <p class="text-[10px] text-green-700 mt-1">গত মাসের তুলনায় ১৪% বেশি</p>
          </div>
          <div class="text-5xl">🏆</div>
        </div>

        <!-- Donut Chart -->
        <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p class="text-[12px] font-bold text-slate-800 mb-4">সাপ্লায়ারভিত্তিক খরচ</p>
          <div class="flex items-center gap-4">
            <!-- CSS Donut -->
            <div class="w-24 h-24 rounded-full flex items-center justify-center relative shrink-0" :style="{ background: `conic-gradient(${donutData.gradient})` }">
              <div class="w-16 h-16 bg-white rounded-full absolute"></div>
              <div class="z-10 text-center">
                <p class="text-[10px] text-slate-500 font-bold">সর্বমোট</p>
                <p class="text-[12px] font-bold text-slate-800">৳ {{ fmt(donutData.total) }}</p>
              </div>
            </div>
            <!-- Legend -->
            <div class="flex-1 space-y-2">
              <div v-for="item in donutData.items" :key="item.name" class="flex justify-between items-center text-[11px]">
                <div class="flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: item.color }"></span>
                  <span class="text-slate-600 truncate max-w-[80px]">{{ item.name }}</span>
                </div>
                <div class="text-right">
                  <span class="font-bold text-slate-800">{{ item.percent }}%</span>
                  <span class="text-[9px] text-slate-500 ml-1">৳{{ fmt(item.amt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI Insight (Mockup style) -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 shadow-sm">
          <div class="text-2xl text-blue-500 bg-white p-1.5 rounded-lg shadow-sm">💡</div>
          <div>
            <p class="text-[11px] font-bold text-blue-900">এই মাসে মোট খরচ গত মাসের চেয়ে ৳ ৩৪,২৫০ (১২%) বেশি হয়েছে!</p>
            <button class="text-[10px] bg-blue-600 text-white px-2 py-1 rounded mt-1.5 font-bold">বিস্তারিত দেখুন →</button>
          </div>
        </div>

        <!-- Price Trend (Bar Chart) -->
        <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p class="text-[12px] font-bold text-slate-800 mb-3">দাম প্রবণতা (গত ৩ মাস)</p>
          <div class="flex items-end justify-between h-28 pt-4 border-b border-slate-100 pb-1">
            <div class="flex flex-col items-center gap-1 w-1/4">
              <span class="text-[9px] font-bold text-slate-600">৳ ৭২</span>
              <div class="w-8 bg-blue-300 rounded-t-sm h-[40%]"></div>
              <span class="text-[10px] text-slate-500 mt-1">এপ্রিল</span>
            </div>
            <div class="flex flex-col items-center gap-1 w-1/4">
              <span class="text-[9px] font-bold text-slate-600">৳ ৭৮</span>
              <div class="w-8 bg-blue-400 rounded-t-sm h-[60%]"></div>
              <span class="text-[10px] text-slate-500 mt-1">মে</span>
            </div>
            <div class="flex flex-col items-center gap-1 w-1/4">
              <span class="text-[9px] font-bold text-slate-600">৳ ৮১</span>
              <div class="w-8 bg-blue-500 rounded-t-sm h-[75%]"></div>
              <span class="text-[10px] text-slate-500 mt-1">জুন</span>
            </div>
            <div class="flex flex-col items-center gap-1 w-1/4">
              <span class="text-[9px] font-bold text-slate-800">৳ ৭৬</span>
              <div class="w-8 bg-[#0b172a] rounded-t-sm h-[65%]"></div>
              <span class="text-[10px] font-bold text-slate-800 mt-1">জুলাই</span>
            </div>
          </div>
        </div>

        <!-- Smart Purchase -->
        <div class="bg-[#0b172a] rounded-xl p-3 flex items-center justify-between shadow-lg text-white">
          <div class="flex items-center gap-2">
            <span class="text-xl">🚀</span>
            <div>
              <p class="text-[12px] font-bold">Smart Purchase Management</p>
              <p class="text-[10px] text-white/70">আপনার ব্যবসাকে আরো এগিয়ে নিন।</p>
            </div>
          </div>
          <button class="bg-amber-400 text-slate-900 px-3 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 whitespace-nowrap">রিপোর্ট ডাউনলোড</button>
        </div>
      </template>

    </div>
  </div>
</template>
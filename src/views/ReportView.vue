<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'

const { profile } = useAuth()
const loading = ref(true)
const purchases = ref([])

// ফিল্টার স্টেট
const dateFilter = ref('month')
const startDate = ref('')
const endDate = ref('')

// একটিভ ট্যাব
const activeTab = ref('overview') // overview, supplier, product, daily, price

// ড্রিল-ডাউন স্টেট
const selectedSupplierDrill = ref(null) // সাপ্লায়ার হিসাব
const selectedProductDrill = ref(null)  // পণ্য হিসাব

const toast = ref('')
function showToast(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
}

function setDateRange(type) {
  dateFilter.value = type
  const d = new Date()
  const year = d.getFullYear()
  const month = d.getMonth()
  
  if (type === 'today') {
    startDate.value = new Date().toISOString().slice(0, 10)
    endDate.value = startDate.value
  } else if (type === 'week') {
    const first = d.getDate() - d.getDay()
    const start = new Date(d.setDate(first))
    startDate.value = start.toISOString().slice(0, 10)
    endDate.value = new Date().toISOString().slice(0, 10)
  } else if (type === 'month') {
    startDate.value = new Date(year, month, 1).toISOString().slice(0, 10)
    endDate.value = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  }
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
  setDateRange('month')
  
  const { data } = await supabase
    .from('purchases')
    .select('*')
    .eq('restaurant_id', rid)
    .order('purchase_date', { ascending: true })

  purchases.value = data || []
  loading.value = false
}

// ফিল্টার করা ডেটা
const filteredPurchases = computed(() => {
  return purchases.value.filter(p => {
    const d = p.purchase_date
    return d >= startDate.value && d <= endDate.value
  })
})

const totalSpend = computed(() => filteredPurchases.value.reduce((s, p) => s + Number(p.total_price), 0))

// ১. সাপ্লায়ার গ্রুপিং (কার কাছ থেকে কত টাকার মাল নেওয়া হলো)
const supplierStats = computed(() => {
  const map = {}
  filteredPurchases.value.forEach(p => {
    const sup = p.supplier || 'সাপ্লায়ার ছাড়া'
    if (!map[sup]) map[sup] = { total: 0, count: 0, items: [] }
    map[sup].total += Number(p.total_price)
    map[sup].count += 1
    map[sup].items.push(p)
  })
  return Object.entries(map).map(([name, data]) => ({
    name, total: data.total, count: data.count, items: data.items,
    percent: totalSpend.value ? Math.round((data.total / totalSpend.value) * 100) : 0
  })).sort((a, b) => b.total - a.total)
})

// ২. পণ্য গ্রুপিং (কোন পণ্য কতবার ও কত টাকায় কেনা হলো)
const productStats = computed(() => {
  const map = {}
  filteredPurchases.value.forEach(p => {
    const name = p.item_name
    if (!map[name]) map[name] = { total: 0, count: 0, items: [] }
    map[name].total += Number(p.total_price)
    map[name].count += 1
    map[name].items.push(p)
  })
  return Object.entries(map).map(([name, data]) => ({
    name, total: data.total, count: data.count, items: data.items,
    percent: totalSpend.value ? Math.round((data.total / totalSpend.value) * 100) : 0
  })).sort((a, b) => b.total - a.total)
})

// ৩. দিনভিত্তিক
const dailyStats = computed(() => {
  const map = {}
  filteredPurchases.value.forEach(p => {
    if (!map[p.purchase_date]) map[p.purchase_date] = { total: 0, items: 0 }
    map[p.purchase_date].total += Number(p.total_price)
    map[p.purchase_date].items += 1
  })
  return Object.entries(map).map(([date, data]) => ({
    date, total: data.total, items: data.items
  })).sort((a, b) => b.date.localeCompare(a.date))
})

// ৪. দাম বাড়া/কমা
const priceTrends = computed(() => {
  const grouped = {}
  filteredPurchases.value.forEach(p => {
    if (!p.unit_price) return
    if (!grouped[p.item_name]) grouped[p.item_name] = []
    grouped[p.item_name].push(p)
  })

  const trends = []
  for (const [item, list] of Object.entries(grouped)) {
    if (list.length < 2) continue
    list.sort((a, b) => new Date(a.purchase_date) - new Date(b.purchase_date))
    const firstPrice = Number(list[0].unit_price)
    const lastPrice = Number(list[list.length - 1].unit_price)
    if (firstPrice === lastPrice) continue
    const diff = lastPrice - firstPrice
    const percent = Math.round((diff / firstPrice) * 100)
    trends.push({ item, firstPrice, lastPrice, diff, percent, unit: list[0].unit, isUp: diff > 0 })
  }
  return trends.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))
})


// সাপ্লায়ারের ড্রিল-ডাউন ডেটা (তারিখ অনুযায়ী গ্রুপ করা)
const groupedSupplierDrill = computed(() => {
  if (!selectedSupplierDrill.value) return []
  
  const map = {}
  selectedSupplierDrill.value.items.forEach(p => {
    if (!map[p.purchase_date]) map[p.purchase_date] = { date: p.purchase_date, total: 0, items: [] }
    map[p.purchase_date].total += Number(p.total_price)
    map[p.purchase_date].items.push(p)
  })
  
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
})

// পণ্যের ড্রিল-ডাউন ডেটা (তারিখ অনুযায়ী গ্রুপ করা)
const groupedProductDrill = computed(() => {
  if (!selectedProductDrill.value) return []
  
  const map = {}
  selectedProductDrill.value.items.forEach(p => {
    if (!map[p.purchase_date]) map[p.purchase_date] = { date: p.purchase_date, total: 0, items: [] }
    map[p.purchase_date].total += Number(p.total_price)
    map[p.purchase_date].items.push(p)
  })
  
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
})

// প্রতিটি তারিখের কার্ড ওপেন/ক্লোজ করার জন্য
const expandedDates = ref([])
function toggleDate(date) {
  if (expandedDates.value.includes(date)) {
    expandedDates.value = expandedDates.value.filter(d => d !== date)
  } else {
    expandedDates.value.push(date)
  }
}


// 🎯 ড্রিল-ডাউন হ্যান্ডলার
function openSupplierDrill(s) {
  selectedSupplierDrill.value = s
  selectedProductDrill.value = null
}
function openProductDrill(p) {
  selectedProductDrill.value = p
  selectedSupplierDrill.value = null
}

function exportCSV() {
  if (!filteredPurchases.value.length) return showToast('ডেটা নেই')
  const headers = ['Date', 'Item', 'Quantity', 'Unit', 'Unit Price', 'Total Price', 'Supplier']
  const csvRows = [headers.join(',')]
  filteredPurchases.value.forEach(p => {
    csvRows.push([p.purchase_date, `"${p.item_name}"`, p.quantity, p.unit, p.unit_price || 0, p.total_price, `"${p.supplier || ''}"`].join(','))
  })
  const link = document.createElement('a')
  link.href = encodeURI("data:text/csv;charset=utf-8,\uFEFF" + csvRows.join('\n'))
  link.download = `Report_${startDate.value}.csv`
  link.click()
  showToast('✅ ডাউনলোড হয়েছে')
}

function printReport() { window.print() }
function fmt(n) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0) }

onMounted(loadData)
</script>

<template>
  <div class="min-h-screen bg-[#f4f7fb] pb-10 relative">
    
    <!-- Header -->
    <div class="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 shadow-sm flex items-center justify-between">
      <div>
        <h1 class="text-[16px] font-bold text-slate-800">রিপোর্ট ও অ্যানালাইসিস</h1>
        <p class="text-[11px] text-slate-500">খরচ, দাম ও সাপ্লায়ার মনিটরিং</p>
      </div>
      <div class="flex gap-2">
        <button @click="exportCSV" class="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        </button>
        <button @click="printReport" class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
        </button>
      </div>
    </div>

    <div class="px-3 pt-3 space-y-3 print:p-0">
      
      <!-- Filters -->
      <div class="no-print space-y-2">
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button @click="setDateRange('today')" :class="dateFilter === 'today' ? 'bg-[#0b172a] text-white' : 'bg-white text-slate-600 border border-slate-200'" class="px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0">আজ</button>
          <button @click="setDateRange('week')" :class="dateFilter === 'week' ? 'bg-[#0b172a] text-white' : 'bg-white text-slate-600 border border-slate-200'" class="px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0">এই সপ্তাহ</button>
          <button @click="setDateRange('month')" :class="dateFilter === 'month' ? 'bg-[#0b172a] text-white' : 'bg-white text-slate-600 border border-slate-200'" class="px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0">এই মাস</button>
          <button @click="dateFilter = 'custom'" :class="dateFilter === 'custom' ? 'bg-[#0b172a] text-white' : 'bg-white text-slate-600 border border-slate-200'" class="px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0">কাস্টম</button>
        </div>
        
        <div class="flex gap-2">
          <template v-if="dateFilter === 'custom'">
            <input type="date" v-model="startDate" class="flex-1 h-9 px-2 rounded-lg border border-slate-200 text-[12px] outline-none bg-white">
            <input type="date" v-model="endDate" class="flex-1 h-9 px-2 rounded-lg border border-slate-200 text-[12px] outline-none bg-white">
          </template>
          <div v-else class="flex-1 bg-slate-100 rounded-lg h-9 flex items-center justify-center text-[11px] font-bold text-slate-600">
            {{ startDate }} থেকে {{ endDate }}
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center text-slate-400 py-10 text-sm no-print">লোড হচ্ছে...</div>
      
      <div v-else class="space-y-3">
        
        <!-- TABS -->
        <div class="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 shadow-sm no-print overflow-x-auto no-scrollbar">
          <button @click="activeTab = 'overview'" class="flex-1 min-w-[80px] h-8 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'overview' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">সারসংক্ষেপ</button>
          <button @click="activeTab = 'supplier'" class="flex-1 min-w-[80px] h-8 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'supplier' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">সাপ্লায়ার</button>
          <button @click="activeTab = 'product'" class="flex-1 min-w-[80px] h-8 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'product' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">পণ্য</button>
          <button @click="activeTab = 'daily'" class="flex-1 min-w-[80px] h-8 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'daily' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">দিনভিত্তিক</button>
          <button @click="activeTab = 'price'" class="flex-1 min-w-[80px] h-8 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'price' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">দামের ট্রেন্ড</button>
        </div>

        <!-- ================= OVERVIEW TAB ================= -->
        <div v-show="activeTab === 'overview'" class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <p class="text-[10px] text-slate-500 font-medium">মোট খরচ</p>
              <p class="text-[18px] font-bold text-[#0b172a] mt-1">৳ {{ fmt(totalSpend) }}</p>
            </div>
            <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <p class="text-[10px] text-slate-500 font-medium">মোট এন্ট্রি</p>
              <p class="text-[18px] font-bold text-[#0b172a] mt-1">{{ filteredPurchases.length }} টি</p>
            </div>
          </div>

          <div class="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 shadow-sm">
            <div class="text-xl text-red-500 shrink-0">⚠️</div>
            <div>
              <p class="text-[11px] font-bold text-red-900">সতর্কতা: দাম বাড়ার প্রবণতা</p>
              <p class="text-[10px] text-red-700 mt-0.5">
                আপনার <strong>{{ priceTrends.filter(p => p.isUp).length }} টি</strong> পণ্যের দাম বেড়েছে। বিস্তারিত জানতে "দামের ট্রেন্ড" ট্যাবে যান।
              </p>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <p class="px-3 py-2 text-[12px] font-bold text-slate-800 border-b border-slate-100">সর্বোচ্চ খরচের পণ্য</p>
            <div class="divide-y divide-slate-50">
              <div v-for="(item, i) in productStats.slice(0, 5)" :key="i" class="p-3 flex justify-between items-center">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-slate-100 text-[10px] font-bold flex items-center justify-center text-slate-600">{{ i+1 }}</div>
                  <p class="text-[12px] font-medium text-slate-800">{{ item.name }}</p>
                </div>
                <p class="text-[12px] font-bold text-slate-800">৳ {{ fmt(item.total) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= SUPPLIER TAB (Drill-down) ================= -->
        <div v-show="activeTab === 'supplier'" class="space-y-3">
          <!-- Supplier List -->
          <div v-if="!selectedSupplierDrill" class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between">
              <p class="text-[11px] font-bold text-slate-700">সাপ্লায়ারভিত্তিক খরচ</p>
              <p class="text-[10px] text-slate-500">বিস্তারিত দেখতে ক্লিক করুন</p>
            </div>
            <div class="divide-y divide-slate-100">
              <button v-for="(s, i) in supplierStats" :key="i" @click="openSupplierDrill(s)" class="w-full text-left p-3 hover:bg-slate-50 active:bg-slate-100 transition">
                <div class="flex justify-between items-center mb-1">
                  <p class="text-[12px] font-bold text-slate-800">{{ s.name }} ›</p>
                  <p class="text-[12px] font-bold text-emerald-600">৳ {{ fmt(s.total) }}</p>
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-500">
                  <span>{{ s.count }} টি লেনদেন</span>
                  <span>{{ s.percent }}%</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full mt-1.5">
                  <div class="bg-[#0b172a] h-1.5 rounded-full" :style="{ width: s.percent + '%' }"></div>
                </div>
              </button>
            </div>
          </div>

          <!-- Supplier Drill-Down Details -->
          <!-- Supplier Drill-Down Details -->
            <div v-else class="space-y-3">
            <button @click="selectedSupplierDrill = null" class="text-[11px] font-bold text-blue-600 flex items-center gap-1">← ফিরে যান</button>
            
            <div class="bg-[#0b172a] rounded-xl p-4 text-white shadow-lg">
                <p class="text-[11px] text-white/70">সাপ্লায়ার</p>
                <p class="text-[16px] font-bold">{{ selectedSupplierDrill.name }}</p>
                <p class="text-[20px] font-bold mt-2">৳ {{ fmt(selectedSupplierDrill.total) }}</p>
                <p class="text-[10px] text-white/50 mt-1">{{ selectedSupplierDrill.items.length }} টি এন্ট্রি ({{ groupedSupplierDrill.length }} দিন)</p>
            </div>

            <!-- Grouped by Date -->
            <div class="space-y-2">
                <div v-for="day in groupedSupplierDrill" :key="day.date" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button @click="toggleDate('sup-' + day.date)" class="w-full p-3 flex justify-between items-center bg-slate-50 active:bg-slate-100">
                    <div class="text-left">
                    <p class="text-[12px] font-bold text-slate-800">{{ day.date }}</p>
                    <p class="text-[10px] text-slate-500">{{ day.items.length }} টি পণ্য</p>
                    </div>
                    <div class="flex items-center gap-2">
                    <p class="text-[13px] font-bold text-emerald-600">৳ {{ fmt(day.total) }}</p>
                    <span class="text-slate-400 text-[10px] transition-transform duration-200" :class="expandedDates.includes('sup-' + day.date) ? 'rotate-180' : ''">▼</span>
                    </div>
                </button>
                
                <!-- Inner Items -->
                <div v-if="expandedDates.includes('sup-' + day.date)" class="divide-y divide-slate-100 border-t border-slate-200">
                    <div v-for="(p, i) in day.items" :key="i" class="p-3 flex justify-between items-center">
                    <div>
                        <p class="text-[12px] font-bold text-slate-800">{{ p.item_name }}</p>
                        <p class="text-[10px] text-slate-500">{{ p.quantity }} {{ p.unit }} • দর: ৳{{ p.unit_price }}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[12px] font-bold text-slate-800">৳ {{ fmt(p.total_price) }}</p>
                    </div>
                    </div>
                </div>
                </div>
            </div>
            </div>
        </div>

        <!-- ================= PRODUCT TAB (Drill-down) ================= -->
        <div v-show="activeTab === 'product'" class="space-y-3">
          <div v-if="!selectedProductDrill" class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between">
              <p class="text-[11px] font-bold text-slate-700">পণ্যভিত্তিক খরচ</p>
              <p class="text-[10px] text-slate-500">বিস্তারিত দেখতে ক্লিক করুন</p>
            </div>
            <div class="divide-y divide-slate-100">
              <button v-for="(p, i) in productStats" :key="i" @click="openProductDrill(p)" class="w-full text-left p-3 hover:bg-slate-50 active:bg-slate-100 transition">
                <div class="flex justify-between items-center mb-1">
                  <p class="text-[12px] font-bold text-slate-800">{{ p.name }} ›</p>
                  <p class="text-[12px] font-bold text-emerald-600">৳ {{ fmt(p.total) }}</p>
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-500">
                  <span>{{ p.count }} বার কেনা হয়েছে</span>
                  <span>{{ p.percent }}%</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full mt-1.5">
                  <div class="bg-[#0b172a] h-1.5 rounded-full" :style="{ width: p.percent + '%' }"></div>
                </div>
              </button>
            </div>
          </div>

            <!-- Product Drill-Down Details -->
            <div v-else class="space-y-3">
            <button @click="selectedProductDrill = null" class="text-[11px] font-bold text-blue-600 flex items-center gap-1">← ফিরে যান</button>
            
            <div class="bg-[#0b172a] rounded-xl p-4 text-white shadow-lg">
                <p class="text-[11px] text-white/70">পণ্য</p>
                <p class="text-[16px] font-bold">{{ selectedProductDrill.name }}</p>
                <p class="text-[20px] font-bold mt-2">৳ {{ fmt(selectedProductDrill.total) }}</p>
                <p class="text-[10px] text-white/50 mt-1">{{ selectedProductDrill.items.length }} বার কেনা হয়েছে ({{ groupedProductDrill.length }} দিন)</p>
            </div>

            <!-- Grouped by Date -->
            <div class="space-y-2">
                <div v-for="day in groupedProductDrill" :key="day.date" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button @click="toggleDate('prod-' + day.date)" class="w-full p-3 flex justify-between items-center bg-slate-50 active:bg-slate-100">
                    <div class="text-left">
                    <p class="text-[12px] font-bold text-slate-800">{{ day.date }}</p>
                    <p class="text-[10px] text-slate-500">{{ day.items.length }} টি এন্ট্রি</p>
                    </div>
                    <div class="flex items-center gap-2">
                    <p class="text-[13px] font-bold text-emerald-600">৳ {{ fmt(day.total) }}</p>
                    <span class="text-slate-400 text-[10px] transition-transform duration-200" :class="expandedDates.includes('prod-' + day.date) ? 'rotate-180' : ''">▼</span>
                    </div>
                </button>
                
                <!-- Inner Items -->
                <div v-if="expandedDates.includes('prod-' + day.date)" class="divide-y divide-slate-100 border-t border-slate-200">
                    <div v-for="(p, i) in day.items" :key="i" class="p-3 flex justify-between items-center">
                    <div>
                        <p class="text-[12px] font-bold text-slate-800">{{ p.supplier || 'সাপ্লায়ার ছাড়া' }}</p>
                        <p class="text-[10px] text-slate-500">{{ p.quantity }} {{ p.unit }} • দর: ৳{{ p.unit_price }}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[12px] font-bold text-slate-800">৳ {{ fmt(p.total_price) }}</p>
                    </div>
                    </div>
                </div>
                </div>
            </div>
            </div>
        </div>

        <!-- ================= DAILY TAB ================= -->
        <div v-show="activeTab === 'daily'" class="space-y-3">
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between">
              <p class="text-[11px] font-bold text-slate-700">দিনভিত্তিক খরচ</p>
              <p class="text-[10px] text-slate-500">তারিখ ও মোট</p>
            </div>
            <div class="divide-y divide-slate-100 max-h-[60vh] overflow-auto">
              <div v-for="(d, i) in dailyStats" :key="i" class="p-3 flex justify-between items-center">
                <div>
                  <p class="text-[12px] font-bold text-slate-800">{{ d.date }}</p>
                  <p class="text-[10px] text-slate-500">{{ d.items }} টি এন্ট্রি</p>
                </div>
                <div class="text-right">
                  <p class="text-[13px] font-bold text-[#0b172a]">৳ {{ fmt(d.total) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= PRICE TRENDS TAB ================= -->
        <div v-show="activeTab === 'price'" class="space-y-3">
          <div class="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
            <div class="px-3 py-2 bg-red-50 border-b border-red-100 flex justify-between items-center">
              <p class="text-[12px] font-bold text-red-800">দাম বেড়েছে (সতর্কতা)</p>
              <span class="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-bold">{{ priceTrends.filter(p => p.isUp).length }} টি</span>
            </div>
            <div class="divide-y divide-slate-100">
              <div v-for="(p, i) in priceTrends.filter(p => p.isUp)" :key="i" class="p-3 flex justify-between items-center">
                <div>
                  <p class="text-[12px] font-bold text-slate-800">{{ p.item }}</p>
                  <p class="text-[10px] text-slate-500">আগে: ৳{{ p.firstPrice }} → এখন: ৳{{ p.lastPrice }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[12px] font-bold text-red-600">+{{ p.percent }}%</p>
                  <p class="text-[10px] text-red-500">+৳{{ p.diff }} / {{ p.unit }}</p>
                </div>
              </div>
              <div v-if="!priceTrends.filter(p => p.isUp).length" class="p-4 text-center text-[11px] text-slate-400">কোনো পণ্যের দাম বাড়েনি</div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
            <div class="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
              <p class="text-[12px] font-bold text-emerald-800">দাম কমেছে (সাশ্রয়)</p>
              <span class="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold">{{ priceTrends.filter(p => !p.isUp).length }} টি</span>
            </div>
            <div class="divide-y divide-slate-100">
              <div v-for="(p, i) in priceTrends.filter(p => !p.isUp)" :key="i" class="p-3 flex justify-between items-center">
                <div>
                  <p class="text-[12px] font-bold text-slate-800">{{ p.item }}</p>
                  <p class="text-[10px] text-slate-500">আগে: ৳{{ p.firstPrice }} → এখন: ৳{{ p.lastPrice }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[12px] font-bold text-emerald-600">{{ p.percent }}%</p>
                  <p class="text-[10px] text-emerald-500">৳{{ p.diff }} / {{ p.unit }}</p>
                </div>
              </div>
              <div v-if="!priceTrends.filter(p => !p.isUp).length" class="p-4 text-center text-[11px] text-slate-400">কোনো পণ্যের দাম কমেনি</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  body { background: white; }
  .no-print { display: none !important; }
  .print\:p-0 { padding: 0 !important; }
}
</style>
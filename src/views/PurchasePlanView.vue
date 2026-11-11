<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'
import html2canvas from 'html2canvas'
import { useRouter } from 'vue-router'
import SwipeToDelete from '../components/SwipeToDelete.vue'
import { playSound } from '../utils/sound'
import { formatDateBn } from '../utils/dateFormat' // 🔥 ডেট ফরম্যাটের জন্য

const router = useRouter()
const { profile } = useAuth()

const loading = ref(true)
const items = ref([])
const purchases = ref([])
const suppliersList = ref([])
const planList = ref([])
const searchQuery = ref('')
const toast = ref('')
const isDownloading = ref(false)
const printArea = ref(null)

// 🔥 ড্রাফট লিস্ট স্টেট
const drafts = ref([])

// 🔥 আনডু লজিকের জন্য স্টেট
const recentlyDeleted = ref(null)
let undoTimeout = null

function updateQty(p, delta) {
  const current = Number(p.quantity) || 0
  const next = Math.max(1, current + delta)
  p.quantity = next
  playSound()
}

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
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

  const [itemsRes, suppliersRes] = await Promise.all([
    supabase.from('items').select('*').eq('restaurant_id', rid).order('name'),
    supabase.from('suppliers').select('*').eq('restaurant_id', rid).order('name')
  ])
  
  items.value = itemsRes.data || []
  suppliersList.value = suppliersRes.data || []

  const { data: pData } = await supabase
    .from('purchases')
    .select('item_name, supplier, unit_price')
    .eq('restaurant_id', rid)
    .not('supplier', 'is', null)
    .not('unit_price', 'is', null)

  purchases.value = pData || []
  await loadDrafts() // 🔥 ড্রাফট লোড করা
  loading.value = false
}

// 🔥 ড্রাফট লোড করার ফাংশন
async function loadDrafts() {
  const rid = getActiveRestaurantId()
  if (!rid) return
  const { data } = await supabase
    .from('purchase_drafts')
    .select('*')
    .eq('restaurant_id', rid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  drafts.value = data || []
}

// 🔥 ড্রাফট ডিলিট করার ফাংশন
async function deleteDraft(id) {
  if (!confirm('আপনি কি এই ড্রাফটটি মুছে ফেলতে চান?')) return
  playSound('delete')
  await supabase.from('purchase_drafts').delete().eq('id', id)
  await loadDrafts()
  showToast('✅ ড্রাফট মুছে ফেলা হয়েছে')
}

const cheapestSuppliers = computed(() => {
  const grouped = {}
  purchases.value.forEach(p => {
    if (!grouped[p.item_name]) grouped[p.item_name] = {}
    if (!grouped[p.item_name][p.supplier]) grouped[p.item_name][p.supplier] = { sum: 0, count: 0 }
    grouped[p.item_name][p.supplier].sum += Number(p.unit_price)
    grouped[p.item_name][p.supplier].count += 1
  })

  const result = {}
  for (const [item, supData] of Object.entries(grouped)) {
    let bestSup = null
    let minAvg = Infinity
    for (const [sup, data] of Object.entries(supData)) {
      const avg = data.sum / data.count
      if (avg < minAvg) { minAvg = avg; bestSup = sup }
    }
    result[item] = { supplier: bestSup, avgPrice: minAvg }
  }
  return result
})

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  
  // 🔥 প্রথমে চেক করব পণ্যটি ইতিমধ্যেই তালিকায় আছে কিনা
  const availableItems = items.value.filter(item => {
    const isAlreadyInPlan = planList.value.some(p => p.item_name === item.name)
    return !isAlreadyInPlan
  })

  if (!q) return availableItems
  return availableItems.filter(i => i.name.toLowerCase().includes(q))
})

function addToPlan(item) {
  playSound()
  const exists = planList.value.find(p => p.item_name === item.name)
  if (exists) return showToast('পণ্যটি ইতিমধ্যেই তালিকায় আছে!')
  
  const cheapest = cheapestSuppliers.value[item.name] || {}
  planList.value.push({
    item_name: item.name,
    unit: item.default_unit,
    quantity: 1,
    original_price: item.last_price || cheapest.avgPrice || 0,
    max_price: item.last_price || cheapest.avgPrice || 0,
    supplier: cheapest.supplier || suppliersList.value[0]?.name || ''
  })
}

function deleteItem(id) {
  playSound('delete')
  const index = planList.value.findIndex(p => p.item_name === id)
  if (index !== -1) {
    recentlyDeleted.value = { item: { ...planList.value[index] }, index }
    planList.value.splice(index, 1)
    
    clearTimeout(undoTimeout)
    undoTimeout = setTimeout(() => {
      recentlyDeleted.value = null
    }, 5000)
  }
}

function undoDeleteItem() {
  playSound('click')
  if (recentlyDeleted.value) {
    planList.value.splice(recentlyDeleted.value.index, 0, recentlyDeleted.value.item)
    recentlyDeleted.value = null
    clearTimeout(undoTimeout)
  }
}

const totalEstCost = computed(() => {
  return planList.value.reduce((sum, p) => sum + (Number(p.max_price) * Number(p.quantity)), 0)
})

const sortedPlanList = computed(() => {
  return [...planList.value].sort((a, b) => {
    const supA = (a.supplier || '').trim()
    const supB = (b.supplier || '').trim()
    if (supA === supB) return a.item_name.localeCompare(b.item_name, 'bn')
    if (!supA) return 1
    if (!supB) return -1
    return supA.localeCompare(supB, 'bn')
  })
})

const groupedPlanList = computed(() => {
  const map = new Map()
  
  // sortedPlanList ব্যবহার করছি, যাতে দোকান অনুযায়ী আগে থেকেই সাজানো থাকে
  sortedPlanList.value.forEach(item => {
    const key = item.supplier || 'সাপ্লায়ার ছাড়া'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  })
  
  return [...map.entries()].map(([supplier, items]) => ({
    supplier,
    items
  }))
})



// 🔥 ইংরেজি সংখ্যা থেকে বাংলা সংখ্যায় কনভার্ট করার ফাংশন
function toBn(number) {
  if (number === null || number === undefined) return ''
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']
  // সংখ্যাটিকে স্ট্রিং-এ রূপান্তর করে প্রতিটি অক্ষরকে বাংলায় বদলে দেওয়া
  return number.toString().replace(/\d/g, d => bnDigits[d])
}

// তারিখ ফরম্যাটেও বাংলা সংখ্যা ব্যবহারের জন্য
function getBnDate() {
  const dateStr = new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  // Intl.DateTimeFormat 'bn-BD' সাধারণত নিজেই বাংলা সংখ্যা দেয়, তবে নিশ্চিত হওয়ার জন্য
  return dateStr 
}


const savingDraft = ref(false)
async function savePlan() {
  if (!planList.value.length) return showToast('তালিকাটি খালি!')
  playSound()
  savingDraft.value = true
  
  const { error } = await supabase.from('purchase_drafts').insert({
    restaurant_id: getActiveRestaurantId(),
    items: planList.value,
    status: 'pending'
  })
  
  savingDraft.value = false
  if (error) return showToast('সেভ হয়নি: ' + error.message)
  
  showToast('✅ ড্রাফট সেভ হয়েছে!')
  downloadImage()
  
  // ড্রাফট সেভ হওয়ার পর লিস্ট খালি করে দেওয়া
  planList.value = []
  await loadDrafts()
  router.push('/today')
}

async function downloadImage() {
  isDownloading.value = true
  try {
    const canvas = await html2canvas(printArea.value, { scale: 2, backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/jpeg', 0.9)
    link.download = `Bazar_List_${new Date().toISOString().slice(0,10)}.jpg`
    link.click()
  } catch (err) {} finally {
    isDownloading.value = false
  }
}

async function copyAsText() {
  if (!planList.value.length) return showToast('তালিকাটি খালি!')
  playSound()
  let text = `🛒 বাজারের তালিকা\n\n`
  sortedPlanList.value.forEach(p => {
    text += `☐ ${p.item_name} - ${p.quantity} ${p.unit} (${p.supplier || 'দোকান নেই'})\n`
  })
  text += `\nসম্ভাব্য সর্বোচ্চ খরচ: ৳ ${fmt(totalEstCost.value)}`
  
  try {
    await navigator.clipboard.writeText(text)
    showToast('✅ তালিকাটি কপি হয়েছে!')
  } catch (err) {
    showToast('কপি করা যায়নি!')
  }
}

onUnmounted(() => {
  clearTimeout(undoTimeout)
})

onMounted(loadData)
</script>

<template>
  <div class="px-3 pt-4 pb-24 space-y-4 bg-[#f4f7fb] min-h-screen relative">
    
    <!-- Header -->
    <div class="bg-gradient-to-r from-[#0b172a] to-slate-800 rounded-xl p-4 text-white shadow-sm flex items-center justify-between">
      <div>
        <h2 class="text-[15px] font-bold">বাজার পরিকল্পনা</h2>
        <p class="text-[11px] text-white/70 mt-0.5">পণ্য যোগ করে তালিকা তৈরি করুন</p>
      </div>
    </div>

    <!-- Item Selection -->
    <div class="space-y-2">
      <div class="relative">
        <input v-model="searchQuery" type="search" placeholder="🔍 পণ্য খুঁজুন..." class="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white outline-none text-[12px] shadow-sm focus:border-blue-500" />
        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
      </div>

      <div class="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto pb-1 pr-0.5">
        <button 
          v-for="item in filteredItems" 
          :key="item.id" 
          @click="addToPlan(item)"
          class="bg-white border border-slate-200 rounded-md p-1.5 shadow-sm active:scale-95 flex flex-col justify-between text-left h-[52px] relative"
        >
          <p class="text-[11px] font-bold text-slate-800 truncate leading-tight">{{ item.name }}</p>
          <p class="text-[8px] text-slate-500">সর্বোচ্চ: ৳{{ item.last_price || 0 }}</p>
          <div class="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[10px]">+</div>
        </button>
      </div>
    </div>
    <div class="flex justify-end mt-1">
      <button @click="$router.push('/items')" class="text-[10px] text-blue-600 font-bold flex items-center gap-1 active:scale-95">
        ➕ তালিকায় নতুন পণ্য যোগ করুন
      </button>
    </div>

    <!-- Plan List -->
    <!-- Plan List (Grouped by Store & Single Line UI) -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      <div class="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <p class="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
          🛒 আমার বাজারের তালিকা
        </p>
        <span class="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">{{ planList.length }} টি</span>
      </div>

      <div v-if="!planList.length" class="p-8 text-center">
        <p class="text-4xl mb-2">🛒</p>
        <p class="text-[12px] text-slate-500">পণ্য যোগ করে বাজার শুরু করুন</p>
      </div>

      <div class="bg-white">
        <!-- 🔥 দোকান অনুযায়ী গ্রুপিং -->
        <div v-for="(group, gIdx) in groupedPlanList" :key="gIdx" class="mb-1">
          
          <!-- স্টোরের নাম (হেডার) -->
          <div class="px-3 py-1.5 bg-slate-100 border-y border-slate-200 flex justify-between items-center">
            <p class="text-[10px] font-bold text-slate-600">📍 {{ group.supplier }}</p>
            <p class="text-[9px] text-slate-500">{{ group.items.length }} টি পণ্য</p>
          </div>

          <!-- পণ্যের লিস্ট -->
          <div class="divide-y divide-slate-50">
            <SwipeToDelete 
              v-for="p in group.items" 
              :key="p.item_name" 
              :id="p.item_name"
              @delete="deleteItem"
              @undo="undoDeleteItem"
            >
              <div class="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                
                <!-- বাম দিক: পণ্যের নাম ও একক -->
                <div class="flex-1 min-w-0 flex items-center gap-1">
                  <p class="text-[12px] font-bold text-slate-800 truncate">{{ p.item_name }}</p>
                  <span class="text-[9px] font-normal text-slate-400 shrink-0">({{ p.unit }})</span>
                </div>

                <!-- ডান দিক: পরিমাণ, দর, মোট -->
                <div class="flex items-center gap-1.5 shrink-0">
                  
                  <!-- পরিমাণ -->
                  <div class="flex items-center border border-slate-200 rounded bg-slate-50 overflow-hidden h-6">
                    <button @click="updateQty(p, -1)" class="w-5 h-full flex items-center justify-center text-slate-500 font-bold active:bg-slate-200">-</button>
                    <input v-model="p.quantity" type="number" class="w-6 text-center text-[10px] font-bold bg-transparent outline-none" />
                    <button @click="updateQty(p, 1)" class="w-5 h-full flex items-center justify-center text-slate-500 font-bold active:bg-slate-200">+</button>
                  </div>

                  <!-- দর -->
                  <div class="flex items-center justify-end w-10">
                    <input v-model="p.max_price" type="number" class="w-full text-right font-medium text-[11px] text-slate-600 bg-transparent outline-none border-b border-slate-300" />
                  </div>

                  <!-- 🔥 লাইন মোট (Line Total) -->
                  <div class="text-right w-12">
                    <p class="text-[11px] font-bold text-slate-800">
                      ৳{{ fmt((Number(p.max_price) || 0) * (Number(p.quantity) || 0)) }}
                    </p>
                  </div>

                </div>
              </div>
            </SwipeToDelete>
          </div>
        </div>
      </div>

      <!-- Total & Actions Section -->
      <div class="p-3 bg-[#0b172a] text-white">
        <div class="flex justify-between items-center mb-3">
          <div>
            <p class="text-[11px] font-bold text-white/80">সম্ভাব্য সর্বোচ্চ খরচ</p>
            <p class="text-[9px] text-white/50">(দাম কিছুটা কম হতে পারে)</p>
          </div>
          <p class="text-[20px] font-bold text-emerald-400">৳ {{ fmt(totalEstCost) }}</p>
        </div>
        
        <!-- বাটনসমূহ -->
        <div class="flex gap-2">
          <button @click="copyAsText" class="w-11 h-10 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center active:scale-95 text-sm shrink-0">
            📋
          </button>
          <button @click="downloadImage" :disabled="isDownloading" class="w-11 h-10 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center active:scale-95 text-sm shrink-0 disabled:opacity-50">
            📥
          </button>
          <button @click="savePlan" :disabled="savingDraft || !planList.length" class="flex-1 h-10 bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 font-bold text-[13px]">
            <span class="text-base">💾</span> {{ savingDraft ? 'সেভ হচ্ছে...' : 'সেভ করুন' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 🔥 নতুন সেকশন: অপেক্ষমাণ বাজার লিস্ট (ড্রাফট) -->
    <div v-if="drafts.length" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
      <div class="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-blue-50">
        <p class="text-[12px] font-bold text-blue-800 flex items-center gap-1">
          <span>📝</span> অপেক্ষমাণ বাজার লিস্ট
        </p>
        <span class="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded font-bold">{{ drafts.length }} টি</span>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="d in drafts" :key="d.id" class="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
          <div class="flex-1">
            <p class="text-[12px] font-bold text-slate-800">{{ d.items.length }} টি পণ্য</p>
            <p class="text-[10px] text-slate-500">{{ formatDateBn(d.created_at) }}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button @click="deleteDraft(d.id)" class="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center active:scale-90 border border-red-100">
              🗑️
            </button>
            <button @click="$router.push('/today')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold active:scale-95">
              দেখুন ›
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- <div class="fixed bottom-24 right-4 z-40 flex flex-col gap-2 items-end">
      <div class="flex gap-2">
        <button @click="copyAsText" class="w-10 h-10 bg-white text-slate-700 rounded-full shadow-md flex items-center justify-center active:scale-90 border border-slate-200">
          <span class="text-sm">📋</span>
        </button>
        <button @click="downloadImage" :disabled="isDownloading" class="w-10 h-10 bg-slate-800 text-white rounded-full shadow-md flex items-center justify-center active:scale-90 border border-slate-700 disabled:opacity-50">
          <span class="text-sm">📥</span>
        </button>
      </div>

      <button @click="savePlan" :disabled="savingDraft" class="h-14 px-5 bg-emerald-600 text-white rounded-full shadow-[0_4px_20px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 mt-1">
        <span class="text-lg">💾</span>
        <span class="text-[14px] font-bold">সেভ করুন</span>
      </button>
    </div> -->

    <!-- Undo Popup Toast -->
    <transition name="slide-up">
      <div v-if="recentlyDeleted" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-[12px] px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-4 border border-slate-700 w-[90%] max-w-[320px] justify-between">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">🗑️</span>
          <span class="truncate"><span class="font-bold">{{ recentlyDeleted.item.item_name }}</span> মুছে ফেলা হয়েছে</span>
        </div>
        <button @click="undoDeleteItem" class="text-emerald-400 font-bold active:scale-95 px-2 py-1 bg-slate-700 rounded-lg shrink-0">
          ↺ আনডু
        </button>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toast" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg whitespace-nowrap">{{ toast }}</div>
    </transition>
  </div>



  <!-- Hidden Image Render Area -->
    <div class="fixed -left-[9999px] top-0">
  <!-- 🔥 প্রস্থ ৩৬০px করা হলো যাতে ডানদিকের লেখা না কাটে -->
  <div ref="printArea" class="w-[360px] bg-white p-4 font-sans text-black">
    
    <!-- হেডার -->
    <div class="text-center border-b-2 border-slate-800 pb-2 mb-3">
      <h1 class="text-[16px] font-black uppercase tracking-wider text-slate-900">বাজারের তালিকা</h1>
      <p class="text-[9px] text-slate-600 mt-0.5">তারিখ: {{ getBnDate() }} </p>
    </div>

    <!-- দোকান অনুযায়ী গ্রুপ -->
        <!-- দোকান অনুযায়ী গ্রুপ -->
    <div v-for="(group, gIdx) in groupedPlanList" :key="gIdx" class="mb-2">
      
      <!-- 🔥 Store Header (একদম মাঝখানে, কোনো বাড়তি স্পেস ছাড়া) -->
      <div class="bg-blue-50 px-2.5 py-1.5 rounded-t-md border-b border-blue-200 flex items-center justify-between w-full">
        <span class="pb-1 flex-1 min-w-0 text-[11px] font-bold text-blue-900 leading-none">
          {{ group.supplier }}
        </span>
        <span class="shrink-0 ml-2 text-[9px] text-blue-700 leading-none">
         {{ toBn(group.items.length) }} টি
        </span>
      </div>

      <!-- পণ্যের লিস্ট -->
      <div class="flex flex-col">
        <div v-for="(p, i) in group.items" :key="i" class="flex items-center justify-between py-1.5 px-2 border-b border-dashed border-slate-200 last:border-0">
          
          <!-- বাম দিক: পণ্যের নাম ও দর -->
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            
            
            <div class="flex items-center gap-1 min-w-0">
              <span class="flex-1 min-w-0 text-[11px] font-bold text-slate-800 leading-none">
                {{ p.item_name }}
              </span>
              <span v-if="Number(p.max_price) > 0" class="text-[8px] text-slate-500 whitespace-nowrap leading-none">
                ({{ toBn(p.quantity) }} {{ p.unit }} ৳{{ toBn(p.max_price) }})
              </span>
              <span v-else class="text-[8px] text-slate-500 whitespace-nowrap leading-none">
               ({{ toBn(p.quantity) }} {{ p.unit }})
              </span>
            </div>
          </div>

          <!-- ডান দিক: মোট দাম -->
          <div class="text-[11px] font-bold text-slate-900 whitespace-nowrap ml-2 leading-none">
             ৳ {{ toBn(fmt((Number(p.max_price) || 0) * (Number(p.quantity) || 0))) }}
          </div>
        </div>
      </div>
    </div>

    <!-- ফুটার (মোট) -->
    <div class="mt-4 pt-2 border-t-2 border-slate-800 border-dashed flex justify-between items-center">
      <span class="text-[12px] font-bold">সর্বমোট:</span>
      <span class="text-[16px] font-black">৳ {{ toBn(fmt(totalEstCost)) }}</span>
    </div>
    
    <div class="mt-2 text-center">
      <p class="text-[7px] text-slate-400">Generated by RCR</p>
    </div>
  </div>
</div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translate(-50%, 20px); }
</style>
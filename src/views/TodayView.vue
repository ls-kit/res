<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'
import { formatDateBn } from '../utils/dateFormat'
import { playSound } from '../utils/sound'
import SwipeToDelete from '../components/SwipeToDelete.vue'

const { profile } = useAuth()

const suppliersList = ref([]) 
const purchases = ref([])
const supplierPhones = ref({})
const loading = ref(true)
const saving = ref(false)
const selectedDate = ref(new Date().toISOString().slice(0, 10))

// 🔥 Undo State
const recentlyDeletedMain = ref(null)
const recentlyDeletedDraft = ref(null)
let undoTimeoutMain = null
let undoTimeoutDraft = null

// ড্রাফট স্টেট
const drafts = ref([])
const showDraftModal = ref(false)
const selectedDraftId = ref(null)
const draftItems = ref([])
const draftSaveDate = ref('') // 🔥 পপআপে তারিখ সেভ করার জন্য
const draftSupplierPaid = ref({}) // দোকানভিত্তিক পরিশোধ

const paidHighlight = ref({}) // কোন দোকানের Paid আপডেট হলো তা ট্র্যাক করতে

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
}

const groups = computed(() => {
  const map = new Map()
  for (const p of purchases.value) {
    const key = p.supplier || '— সাপ্লায়ার ছাড়া —'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(p)
  }
  return [...map.entries()].map(([supplier, list]) => ({
    supplier,
    list,
    total: list.reduce((s, p) => s + (Number(p.total_price) || 0), 0),
    due: list.reduce((s, p) => s + (Number(p.due_amount) || 0), 0)
  }))
})

const totalSum = computed(() => purchases.value.reduce((s, p) => s + (Number(p.total_price) || 0), 0))
const totalDue = computed(() => purchases.value.reduce((s, p) => s + (Number(p.due_amount) || 0), 0))

// 🔥 ড্রাফট পপআপের গ্রুপিং ও Paid/Due হিসাব
const draftGroups = computed(() => {
  const map = new Map()
  draftItems.value.forEach(p => {
    const key = p.supplier || '— সাপ্লায়ার ছাড়া —'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(p)
  })
  
  return [...map.entries()].map(([supplier, list]) => {
    const total = list.reduce((s, p) => s + (Number(p.line_total) || 0), 0)
    const paid = Number(draftSupplierPaid.value[supplier]) || 0
    const due = Math.max(0, total - paid)
    return { supplier, list, total, paid, due }
  })
})

const draftTotal = computed(() => draftGroups.value.reduce((s, g) => s + g.total, 0))
const draftTotalDue = computed(() => draftGroups.value.reduce((s, g) => s + g.due, 0))

// 🔥 Paid ও সাবটোটাল অটো-আপডেট এবং ব্লিংক লজিক
watch(draftItems, (newItems) => {
  if (!showDraftModal.value) return
  
  const currentTotals = {}
  newItems.forEach(p => {
    const key = p.supplier || '— সাপ্লায়ার ছাড়া —'
    if (!currentTotals[key]) currentTotals[key] = 0
    currentTotals[key] += Number(p.line_total) || 0
  })

  Object.keys(currentTotals).forEach(key => {
    const newTotal = currentTotals[key]
    const currentPaid = Number(draftSupplierPaid.value[key]) || 0
    
    // যদি Paid এর পরিমাণ ০ থাকে বা পুরো টাকা দেওয়া থাকে, তবে নতুন টোটাল বসিয়ে দেব
    if (currentPaid === 0 || currentPaid !== newTotal) {
      // যদি আগের টোটাল আর নতুন টোটাল এক না হয়, তবে আপডেট করব
      draftSupplierPaid.value[key] = newTotal
      
      // 🔥 ব্লিংক অ্যানিমেশন ট্রিগার
      paidHighlight.value[key] = true
      setTimeout(() => {
        paidHighlight.value[key] = false
      }, 1000)
    }
  })
}, { deep: true })


async function load() {
  const rid = getActiveRestaurantId()
  if (!rid) return
  loading.value = true
  
  const [purchasesRes, suppliersRes] = await Promise.all([
    supabase.from('purchases').select('*').eq('restaurant_id', rid).eq('purchase_date', selectedDate.value).order('created_at', { ascending: true }),
    supabase.from('suppliers').select('*').eq('restaurant_id', rid)
  ])

  if (!purchasesRes.error) purchases.value = purchasesRes.data || []
  if (!suppliersRes.error) {
    suppliersList.value = suppliersRes.data || []
    const map = {}
    for (const s of suppliersRes.data || []) {
      if (s.phone) map[s.name] = s.phone
    }
    supplierPhones.value = map
  }
  loading.value = false
}

async function loadDrafts() {
  const rid = getActiveRestaurantId()
  if (!rid) return
  const { data, error } = await supabase.from('purchase_drafts').select('*').eq('restaurant_id', rid).eq('status', 'pending').order('created_at', { ascending: false })
  if (!error) drafts.value = data || []
}

watch(selectedDate, () => { load() })

/* ---------- Main Page Delete / Undo ---------- */
function handleDeleteMain(id) {
  const index = purchases.value.findIndex(p => p.id === id)
  if (index !== -1) {
    recentlyDeletedMain.value = { item: { ...purchases.value[index] }, index }
    purchases.value.splice(index, 1)
    clearTimeout(undoTimeoutMain)
    undoTimeoutMain = setTimeout(async () => {
      await supabase.from('purchases').delete().eq('id', id)
      recentlyDeletedMain.value = null
    }, 5000)
  }
}

function undoDeleteMain() {
  playSound('click')
  if (recentlyDeletedMain.value) {
    purchases.value.splice(recentlyDeletedMain.value.index, 0, recentlyDeletedMain.value.item)
    recentlyDeletedMain.value = null
    clearTimeout(undoTimeoutMain)
  }
}

/* ---------- Helpers ---------- */
function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
}

function phoneOf(supplier) {
  return supplierPhones.value[supplier] || ''
}

function isAdjusted(p) {
  const q = Number(p.quantity) || 0
  const up = Number(p.unit_price) || 0
  const total = Number(p.total_price) || 0
  if (!q || !up || !total) return false
  return Math.abs((q * up) - total) > 0.01
}

function adjustmentOf(p) {
  const q = Number(p.quantity) || 0
  const up = Number(p.unit_price) || 0
  const total = Number(p.total_price) || 0
  return total - q * up
}

function showToast(msg) { alert(msg) }

/* ---------- Draft Actions ---------- */
function openDraft(draft) {
  selectedDraftId.value = draft.id
  draftSupplierPaid.value = {}
  draftSaveDate.value = selectedDate.value 
  draftItems.value = JSON.parse(JSON.stringify(draft.items)).map(item => {
    return {
      ...item,
      original_price: item.original_price || item.max_price, 
      line_total: (Number(item.max_price) || 0) * (Number(item.quantity) || 1)
    }
  })
  
  const map = {}
  draftItems.value.forEach(p => {
    const key = p.supplier || '— সাপ্লায়ার ছাড়া —'
    if (!map[key]) map[key] = 0
    map[key] += Number(p.line_total) || 0
  })
  draftSupplierPaid.value = map
  showDraftModal.value = true
}



// 🔥 দর পরিবর্তন করলে মোট আপডেট হবে
function updateDraftPrice(p) {
  const qty = Number(p.quantity) || 1
  const price = Number(p.max_price) || 0
  p.line_total = +(qty * price).toFixed(2)
}

// 🔥 মোট পরিবর্তন করলে দর আপডেট হবে
function updateDraftTotal(p) {
  const qty = Number(p.quantity) || 1
  const total = Number(p.line_total) || 0
  p.max_price = +(total / qty).toFixed(2)
}



// 🔥 ড্রাফট ডিলিট (Undo সহ)
function handleDeleteDraftItem(itemName, index) {
  playSound('delete')
  const item = draftItems.value[index]
  recentlyDeletedDraft.value = { item: { ...item }, index }
  draftItems.value.splice(index, 1)
  
  clearTimeout(undoTimeoutDraft)
  undoTimeoutDraft = setTimeout(() => {
    recentlyDeletedDraft.value = null
  }, 4000)
}

function undoDeleteDraftItem() {
  playSound('click')
  if (recentlyDeletedDraft.value) {
    draftItems.value.splice(recentlyDeletedDraft.value.index, 0, recentlyDeletedDraft.value.item)
    recentlyDeletedDraft.value = null
    clearTimeout(undoTimeoutDraft)
  }
}

// 🔥 ড্রাফট সেভ
async function confirmDraft() {
  if (!draftItems.value.length) return showToast('কোনো পণ্য নেই!')
  saving.value = true
  
  const rowsToInsert = draftItems.value.map(p => {
    const qty = Number(p.quantity) || 1
    const currentPrice = Number(p.max_price) || 0
    const originalPrice = Number(p.original_price) || currentPrice
    
    let finalTotal = currentPrice * qty
    if (p.line_total !== undefined && p.line_total !== null && p.line_total !== '') {
      finalTotal = Number(p.line_total)
    }
    let finalUnitPrice = originalPrice
    if (p.line_total !== '') { finalUnitPrice = finalTotal / qty }

    const supplierKey = p.supplier || '— সাপ্লায়ার ছাড়া —'
    const group = draftGroups.value.find(g => g.supplier === supplierKey)
    let itemDue = 0
    if (group && group.due > 0 && group.total > 0) {
      itemDue = (group.due * finalTotal) / group.total
    }

    return {
      item_name: p.item_name,
      quantity: qty,
      unit: p.unit,
      unit_price: +finalUnitPrice.toFixed(2), 
      total_price: +finalTotal.toFixed(2),     
      paid_amount: +(finalTotal - itemDue).toFixed(2),
      due_amount: +itemDue.toFixed(2),
      supplier: p.supplier || null,
      note: null,
      purchase_date: draftSaveDate.value,
      status: 'pending',
      restaurant_id: getActiveRestaurantId()
    }
  })

  const { error } = await supabase.from('purchases').insert(rowsToInsert)
  if (error) { showToast('সেভ হয়নি: ' + error.message); saving.value = false; return }

  await supabase.from('purchase_drafts').delete().eq('id', selectedDraftId.value)


  for (const p of draftItems.value) {
    const newPrice = Number(p.max_price) || 0
    if (newPrice > 0) {
      await supabase
        .from('items')
        .update({ last_price: newPrice })
        .eq('restaurant_id', getActiveRestaurantId())
        .eq('name', p.item_name)
    }
  }

  await load()
  await loadDrafts()
  
  showDraftModal.value = false
  saving.value = false
  showToast('✅ সফলভাবে পারচেজে যোগ হয়েছে!')
}

onMounted(async () => {
  if (!profile.value) {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (profile.value) { clearInterval(check); resolve() }
      }, 100)
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
  }
  await load()
  await loadDrafts()
})
</script>

<template>
  <div class="px-3 pt-3 space-y-3 pb-24">
    
    <input type="date" v-model="selectedDate" class="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 outline-none text-sm" />

    <!-- ড্রাফট লিস্ট সেকশন -->
    <div v-if="drafts.length" class="bg-blue-50 border border-blue-200 rounded-xl p-3 shadow-sm space-y-2">
      <p class="text-[12px] font-bold text-blue-800 flex items-center gap-1">
        <span>📝</span> সেভ করা বাজার লিস্ট
      </p>
      <div v-for="d in drafts" :key="d.id" class="flex justify-between items-center bg-white p-2 rounded-lg border border-blue-100">
        <div>
          <p class="text-[12px] font-bold text-slate-700">{{ d.items.length }} টি পণ্য</p>
          <p class="text-[10px] text-slate-500">{{ formatDateBn(d.created_at) }}</p>
        </div>
        <button @click="openDraft(d)" class="px-3 py-1.5 bg-blue-600 text-white rounded text-[11px] font-bold active:scale-95">
          লোড করুন
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center text-slate-400 py-10 text-sm">লোড হচ্ছে...</div>

    <div v-else-if="!purchases.length" class="text-center py-14">
      <p class="text-5xl mb-3">🧾</p>
      <p class="text-slate-500 text-sm">এই দিনে কোনো কেনাকাটা নেই</p>
    </div>

    <!-- Purchases List -->
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
<div class="px-3 py-2.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex flex-col items-center justify-center gap-1.5">
  <!-- টাইটেল -->
  <p class="text-[12px] font-bold text-slate-700 flex items-center gap-1">
    🧾 দৈনিক ক্রয় মেমো
  </p>
  
  <!-- তারিখের ব্যাজ -->
  <div class="flex items-center gap-1.5 text-[11px]">
    <span class="text-slate-500">আপনি দেখছেন:</span>
    <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
      {{ formatDateBn(selectedDate) }}
    </span>
  </div>
</div>

      <div class="grid grid-cols-12 gap-1 px-2.5 py-1.5 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
        <div class="col-span-5">পণ্য</div>
        <div class="col-span-2 text-center">পরিমাণ</div>
        <div class="col-span-2 text-right">দর</div>
        <div class="col-span-2 text-right">মোট</div>
        <div class="col-span-1"></div>
      </div>

      <div v-for="g in groups" :key="g.supplier">
        <div class="flex items-center justify-between gap-2 px-2.5 py-2 bg-emerald-50/60 border-y border-emerald-100">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[11px] text-emerald-700 shrink-0">📍</span>
            <span class="text-[12px] font-semibold text-emerald-800 truncate">{{ g.supplier }}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <a v-if="phoneOf(g.supplier)" :href="`tel:${phoneOf(g.supplier)}`" class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-medium active:scale-95">📞 কল</a>
            <span class="text-[10px] text-slate-400">{{ g.list.length }} আইটেম</span>
          </div>
        </div>

        <SwipeToDelete 
          v-for="p in g.list" 
          :key="p.id" 
          :id="p.id"
          @delete="handleDeleteMain(p.id)"
        >
          <div class="grid grid-cols-12 gap-1 px-2.5 py-2 items-center text-[12px] bg-white" :class="isAdjusted(p) ? 'bg-amber-50/60' : ''">
            <div class="col-span-5 min-w-0">
              <p class="font-medium text-slate-800 truncate">
                {{ p.item_name }} 
                <span v-if="isAdjusted(p)" class="text-[10px] text-amber-700 font-medium truncate"> 
                  <span v-if="adjustmentOf(p) < 0">({{ fmt(Math.abs(adjustmentOf(p))) }} কম)</span>
                  <span v-else>(+{{ fmt(adjustmentOf(p)) }})</span>  
                </span>
                <span v-if="isAdjusted(p)" class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle ml-1"></span>
              </p>
            </div>
            <div class="col-span-2 text-center" :class="isAdjusted(p) ? 'text-amber-800' : 'text-slate-700'">
              {{ p.quantity }} <span class="text-[10px]">{{ p.unit }}</span>
            </div>
            <div class="col-span-2 text-right">
              {{ p.unit_price ? fmt(p.unit_price) : '—' }}
            </div>
            <div class="col-span-2 text-right">
              <p class="font-semibold">{{ p.total_price ? fmt(p.total_price) : '—' }}</p>
            </div>
            <div class="col-span-1 text-right hidden md:block">
              <button @click="handleDeleteMain(p.id)" class="text-slate-300 text-sm active:text-red-500">✕</button>
            </div>
          </div>
        </SwipeToDelete>

        <div class="grid grid-cols-12 gap-1 px-2.5 py-1.5 bg-slate-50 text-[11px] border-b border-slate-200">
          <div class="col-span-9 text-slate-500">সাবটোটাল — {{ g.supplier }}</div>
          <div class="col-span-3 text-right">
            <p class="font-semibold text-slate-700">৳ {{ fmt(g.total) }}</p>
            <p v-if="g.due > 0" class="text-[9px] font-bold text-red-500">বাকি: ৳{{ fmt(g.due) }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-12 gap-1 px-2.5 py-3 bg-slate-900 text-white items-center">
        <div class="col-span-9">
          <p class="text-[11px] text-white/70">সর্বমোট ({{ purchases.length }} আইটেম)</p>
          <p v-if="totalDue > 0" class="text-[10px] text-red-400 font-bold mt-0.5">মোট বাকি: ৳ {{ fmt(totalDue) }}</p>
        </div>
        <div class="col-span-3 text-right text-[18px] font-bold">৳ {{ fmt(totalSum) }}</div>
      </div>
    </div>
  </div>

  <!-- Undo Toast Main -->
  <transition name="slide-up">
    <div v-if="recentlyDeletedMain" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-[12px] px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-4 border border-slate-700 w-[90%] max-w-[320px] justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-base">🗑️</span>
        <span class="truncate"><span class="font-bold">{{ recentlyDeletedMain.item.item_name }}</span> মুছে ফেলা হয়েছে</span>
      </div>
      <button @click="undoDeleteMain" class="text-emerald-400 font-bold px-2 py-1 bg-slate-700 rounded-lg shrink-0">↺ আনডু</button>
    </div>
  </transition>

  <!-- 🔥 নতুন আপডেট: ড্রাফট কনফার্ম মডাল (দোকানভিত্তিক গ্রুপিং ও বাকি) -->
    <!-- 🔥 ড্রাফট কনফার্ম মডাল -->
  <div v-if="showDraftModal" class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" @click.self="showDraftModal = false">
    <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl relative">
      
<div class="px-3 py-2.5 bg-slate-50 border-b border-slate-100 rounded-t-2xl flex items-center justify-between gap-2">
  <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 shadow-sm">
      <span class="text-[9px] font-bold text-slate-500">জমা তারিখ:</span>
      <span class="text-[10px] font-bold text-emerald-700">
        {{ formatDateBn(draftSaveDate) }}
      </span>
      
      <!-- ক্যালেন্ডার আইকন -->
      <div class="relative w-5 h-5 rounded bg-slate-100 flex items-center justify-center cursor-pointer overflow-hidden ml-0.5">
        <span class="text-[10px]">📅</span>
        <input 
          type="date" 
          v-model="draftSaveDate" 
          class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
        />
      </div>
    </div>

  <!-- ডান দিক: তারিখ পিকার ও ক্লোজ বাটন -->
  <div class="flex items-center gap-2">
    
  <!-- বাম দিক: টাইটেল -->
  <p class="text-[13px] font-bold text-slate-800 shrink-0">
    বাজার কনফার্ম করুন
  </p>

    <!-- ক্লোজ বাটন -->
    <button @click="showDraftModal = false" class="text-slate-400 bg-white border border-slate-200 rounded-full w-6 h-6 flex items-center justify-center shadow-sm active:scale-95 shrink-0 text-xs">
      ✕
    </button>
  </div>

</div>

      <!-- হেডার (ডেট পিকারের নিচে, টেবিলের ঠিক উপরে) -->
      <div class="grid grid-cols-12 gap-1 px-2 py-1.5 bg-slate-100 border-b border-slate-200 text-[9px] font-bold text-slate-500 rounded-t-lg">
        <div class="col-span-5">পণ্য</div>
        <div class="col-span-2 text-center">পরিমাণ</div>
        <div class="col-span-2 text-right">দর (৳)</div>
        <div class="col-span-3 text-right pr-1">মোট (৳)</div>
      </div>

      <div class="p-2 overflow-auto flex-1 bg-slate-50 relative">
        
        <!-- দোকান অনুযায়ী গ্রুপ -->
        <div v-for="(g, gi) in draftGroups" :key="gi" class="mb-3">
          
        <div class="flex items-center justify-between px-2 py-1.5 bg-slate-200 rounded-t-lg">
          <!-- বাম দিকে সাপ্লায়ার নাম -->
          <p class="text-[11px] font-bold text-slate-700 truncate max-w-[150px]">📍 {{ g.supplier }}</p>
          
          <!-- ডান দিকে কল বাটন ও সংখ্যা -->
          <div class="flex items-center gap-2 shrink-0">
            <!-- 🔥 সুন্দর SVG কল বাটন -->
            <a 
              v-if="phoneOf(g.supplier)" 
              :href="`tel:${phoneOf(g.supplier)}`" 
              class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center active:scale-95 shadow-sm"
              title="কল দিন"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
              </svg>
            </a>
            <p class="text-[10px] text-slate-600 font-bold">{{ g.list.length }} টি পন্য</p>
          </div>
        </div>

        <!-- <div class="grid grid-cols-12 gap-1 px-1 py-1 bg-slate-100 text-[9px] font-bold text-slate-500 border-b border-slate-200">
          <div class="col-span-5">পণ্য</div>
          <div class="col-span-2 text-center">পরিমাণ</div>
          <div class="col-span-2 text-right">দর</div>
          <div class="col-span-3 text-right pr-1">মোট</div>
        </div> -->

          <div class="space-y-0.5 mt-0.5">
            <SwipeToDelete 
              v-for="(p, i) in g.list" 
              :key="i" 
              :id="p.item_name"
              @delete="handleDeleteDraftItem(p.item_name, draftItems.indexOf(p))"
            >
              <div class="grid grid-cols-12 gap-1 items-center bg-white p-1.5 shadow-sm">
                
                <!-- পণ্যের নাম (col-span-4) -->
                <!-- পণ্যের নাম ও একক এক লাইনে -->
                <div class="col-span-5 min-w-0">
                  <p class="text-[11px] font-bold text-slate-800 truncate">
                    {{ p.item_name }}
                    <span class="text-[10px] font-normal text-slate-400 ml-0.5 inline-block scale-75 origin-left">({{ p.unit }})</span>
                  </p>
                </div>

                <!-- পরিমাণ (col-span-2) -->
                <div class="col-span-2">
                  <input 
                    v-select-on-focus 
                    v-model="p.quantity" 
                    @input="updateDraftPrice(p)" 
                    type="number" 
                    class="w-full h-7 px-0.5 border border-slate-300 rounded text-[10px] text-center font-bold outline-none" 
                  />
                </div>

                <!-- দর (col-span-2) -->
                <div class="col-span-2">
                  <input 
                    v-select-on-focus 
                    v-model="p.max_price" 
                    @input="updateDraftPrice(p)" 
                    type="number" 
                    class="w-full h-7 px-0.5 border border-slate-300 rounded text-[10px] text-right font-bold outline-none" 
                  />
                </div>

                <!-- মোট (col-span-4) -->
                <div class="col-span-3">
                  <input 
                    v-select-on-focus 
                    v-model="p.line_total" 
                    @input="updateDraftTotal(p)" 
                    type="number" 
                    class="w-full h-7 px-0.5 border border-amber-300 bg-amber-50 rounded text-[10px] text-right font-bold text-amber-900 outline-none" 
                  />
                </div>

              </div>
            </SwipeToDelete>
          </div>

          <!-- 🔥 সাবটোটাল, পরিশোধ ও বাকি (এক লাইনে) -->
          <div class="scale-95 bg-slate-100 rounded-b-lg p-1 mt-0.5 border-t border-slate-200 flex items-center justify-between gap-1 text-[9px]">
            
            <!-- সাবটোটাল -->
            <div class="font-bold text-slate-600 shrink-0">
              সাব: <span class="text-slate-800">৳{{ fmt(g.total) }}</span>
            </div>

            <!-- পরিশোধ (Paid) -->
            <div 
              class="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0 transition-all duration-300"
              :class="paidHighlight[g.supplier] ? 'ring-2 ring-amber-400 bg-amber-50 scale-105' : ''"
            >
              <span class="text-[9px] text-emerald-700 font-bold">পরিশোধ:</span>
              <span class="text-[9px] text-emerald-700 font-bold">৳</span>
              <input 
                v-select-on-focus 
                v-model="draftSupplierPaid[g.supplier]" 
                type="number" 
                class="w-12 bg-transparent text-right text-[11px] font-bold text-emerald-800 outline-none" 
              />
              <button @click="draftSupplierPaid[g.supplier] = String(g.total)" class="text-[8px] bg-emerald-600 text-white px-1.5 py-0.5 rounded active:scale-95 shrink-0">সম্পূর্ণ</button>
            </div>

            <!-- বাকি (Due) -->
            <div class="font-bold shrink-0 text-right">
              <span class="text-slate-500">বাকি:</span>
              <span :class="g.due > 0 ? 'text-red-500' : 'text-emerald-600'">
                {{ g.due > 0 ? '(-৳' + fmt(g.due) + ')' : '(৳০)' }}
              </span>
            </div>

          </div>

        </div>

        <div v-if="!draftItems.length" class="text-center py-10">
          <p class="text-slate-400 text-[12px]">সব পণ্য বাদ দেওয়া হয়েছে</p>
        </div>
      </div>

      <!-- 🔥 Undo Popup (ড্রাফট মডাল) -->
      <transition name="slide-up">
        <div v-if="recentlyDeletedDraft" class="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl flex items-center gap-3 w-[90%] justify-between">
          <span class="truncate"><span class="font-bold">{{ recentlyDeletedDraft.item.item_name }}</span> মুছে ফেলা হয়েছে</span>
          <button @click="undoDeleteDraftItem" class="text-emerald-400 font-bold shrink-0">↺ আনডু</button>
        </div>
      </transition>

      <!-- 🔥 পুরো বিলের মোট সামারি (এক লাইনে) -->
      <div class="p-3 bg-slate-800 text-white flex items-center justify-between gap-2">
        <div class="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg border border-white/10">
          <span class="text-[14px] text-white/70">মোট ও নগদ পরিশোধ:</span>
          <span class="text-[14px] font-bold text-emerald-400">৳ {{ fmt(draftTotal) }}</span>
        </div>
        
        <div class="flex items-center gap-1 bg-red-500/20 px-2 py-1 rounded-lg border border-red-500/30">
          <span class="text-[10px] text-red-200">মোট বাকি:</span>
          <span class="text-[14px] font-bold text-red-400">৳ {{ fmt(draftTotalDue) }}</span>
        </div>
      </div>

      <div class="p-4 border-t border-slate-100 flex gap-2 bg-slate-50 rounded-b-2xl">
        <button @click="showDraftModal = false" class="flex-1 h-11 rounded-xl bg-slate-200 text-slate-700 font-bold text-[13px]">বাতিল</button>
        <button @click="confirmDraft" :disabled="saving || !draftItems.length" class="flex-[2] h-11 rounded-xl bg-emerald-600 text-white font-bold text-[13px] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <span>✓</span> {{ saving ? 'সেভ হচ্ছে...' : 'নিশ্চিত করুন' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translate(-50%, 20px); }
</style>
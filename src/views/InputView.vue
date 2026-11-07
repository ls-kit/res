<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { supabase } from '../supabase'

import { useAuth } from '../composables/useAuth'
import { watch } from 'vue' 
import { formatDateBn } from '../utils/dateFormat'

const { profile } = useAuth()

// বর্তমানে কোন রেস্টুরেন্টের ডেটা দেখা হচ্ছে তা বের করা
function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) {
    return overriddenId
  }
  return profile.value?.restaurant_id
}

const UNITS = ['কেজি', 'গ্রাম', 'পিস', 'লিটার', 'মিলি', 'ডজন', 'বস্তা', 'প্যাকেট', 'বার']
const EXPENSE_TYPES = ['যাতায়াত', 'টিপস', 'মজুরি', 'ভাড়া', 'ইউটিলিটি', 'মেরামত']

const getIcon = (name) => {
  if (!name) return '📦'
  if (name.includes('চাল')) return '🍚'
  if (name.includes('তেল')) return '🛢️'
  if (name.includes('পেঁয়াজ')) return '🧅'
  if (name.includes('আলু')) return '🥔'
  if (name.includes('মাছ')) return '🐟'
  if (name.includes('মাংস')) return '🥩'
  if (name.includes('মুরগি')) return '🍗'
  if (name.includes('অতিরিক্ত খরচ') || name.includes('যাতায়াত') || name.includes('টিপস') || name.includes('মজুরি') || name.includes('ভাড়া') || name.includes('ইউটিলিটি') || name.includes('মেরামত')) return '💸'
  return '🥦'
}

function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

const items = ref([])
const supplierList = ref([])
const meta = reactive({
  purchase_date: todayISO(),
  supplier: '',
  note: '',
  discount_type: 'percent',
  discount_value: '',
  other_expense: '',
  other_expense_note: ''
})

let rowKey = 0
const rows = ref([makeRow()])

function makeRow(prefill = {}) {
  return {
    key: ++rowKey,
    item_name: prefill.item_name || '',
    quantity: prefill.quantity ?? 1,
    unit: prefill.unit || 'কেজি',
    unit_price: prefill.unit_price ?? '',
    line_override: '',
    isOverride: false,
    showSuggest: false,
    showUnitSheet: false
  }
}

const saving = ref(false)
const toast = ref('')
const todaySummary = ref({ count: 0, total: 0 })

const monthlySummary = ref({ total: 0 })
const totalSavingsMonth = ref(0)

/* --- Expense Dropdown --- */
const showExpenseDropdown = ref(false)
function pickExpenseType(type) {
  meta.other_expense_note = type
  showExpenseDropdown.value = false
}

/* --- Add New Item Inline --- */
const showNewItemForm = ref(false)
const newItemForm = reactive({ name: '', unit: 'কেজি' })
const addingItem = ref(false)

async function saveNewItem() {
  if (!newItemForm.name.trim()) return showToast('পণ্যের নাম দিন')
  
  // ডুপ্লিকেট চেক
  const exists = items.value.some(
    i => i.name.trim().toLowerCase() === newItemForm.name.trim().toLowerCase()
  )
  if (exists) return showToast('⚠️ এই পণ্যটি ইতিমধ্যেই তালিকায় আছে!')

  addingItem.value = true
  const payload = { 
    name: newItemForm.name.trim(), 
    default_unit: newItemForm.unit,
    restaurant_id: getActiveRestaurantId() // 🔥 যোগ করুন
  }
  
  const { error } = await supabase.from('items').upsert(payload, { onConflict: 'name' })
  addingItem.value = false
  
  if (error) return showToast('যোগ হয়নি: ' + error.message)
  
  await loadItems()
  showNewItemForm.value = false
  newItemForm.name = ''
  showToast('✅ নতুন পণ্য যোগ হয়েছে')
}

/* --- Product Picker (Grid & Grouped) --- */
const showProductList = ref(false)
const productSearch = ref('')
const productVisible = ref(15)

const filteredProductList = computed(() => {
  const q = productSearch.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(q))
})

// গ্রিড ভিউ এবং বর্ণানুক্রমিক গ্রুপিং
const groupedProducts = computed(() => {
  const groups = {}
  const sorted = [...filteredProductList.value].sort((a, b) => a.name.localeCompare(b.name, 'bn'))
  
  sorted.forEach(item => {
    const firstLetter = item.name.charAt(0).toUpperCase()
    if (!groups[firstLetter]) groups[firstLetter] = []
    groups[firstLetter].push(item)
  })
  
  return Object.keys(groups).sort((a, b) => a.localeCompare(b, 'bn')).map(letter => ({
    letter,
    items: groups[letter]
  }))
})

// স্লাইস করা গ্রুপিং (আরও দেখানোর জন্য)
const visibleGroupedProducts = computed(() => {
  let count = 0
  const result = []
  for (const group of groupedProducts.value) {
    if (count >= productVisible.value) break
    const remaining = productVisible.value - count
    const slicedItems = group.items.slice(0, remaining)
    result.push({ letter: group.letter, items: slicedItems })
    count += slicedItems.length
  }
  return result
})
const hasMoreProducts = computed(() => filteredProductList.value.length > productVisible.value)

function openProductList() {
  showProductList.value = true
  productSearch.value = ''
  productVisible.value = 15
  showNewItemForm.value = false
}

function pickProductFromList(item) {
  showProductList.value = false
  const last = rows.value[rows.value.length - 1]
  if (last.item_name && last.quantity) addRow()
  
  nextTick(() => {
    const target = rows.value[rows.value.length - 1]
    pickItem(target, item)
  })
}

/* --- Calculations --- */
const subtotal = computed(() => rows.value.reduce((s, r) => s + lineTotal(r), 0))

const discountAmount = computed(() => {
  const v = parseFloat(meta.discount_value)
  if (isNaN(v) || v <= 0) return 0
  if (meta.discount_type === 'percent') return Math.min(subtotal.value, (subtotal.value * v) / 100)
  return Math.min(subtotal.value, v)
})

const otherExp = computed(() => parseFloat(meta.other_expense) || 0)
const grandTotal = computed(() => Math.max(0, subtotal.value - discountAmount.value + otherExp.value))

const totalSavings = computed(() => {
  let totalDiscount = 0
  rows.value.forEach(r => {
    if (r.isOverride) {
      const q = parseFloat(r.quantity) || 0
      const p = parseFloat(r.unit_price) || 0
      const expected = q * p
      const override = parseFloat(r.line_override) || 0
      if (override < expected) totalDiscount += (expected - override)
    }
  })
  return totalDiscount
})

/* --- Helpers --- */
function lineTotal(r) {
  if (r.isOverride) {
    const o = parseFloat(r.line_override)
    if (!isNaN(o)) return +o.toFixed(2)
  }
  const q = parseFloat(r.quantity)
  const p = parseFloat(r.unit_price)
  if (isNaN(q) || isNaN(p)) return 0
  return +(q * p).toFixed(2)
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
}

function flash(el) {
  if (!el) return
  el.classList.add('flash-focus')
  setTimeout(() => el.classList.remove('flash-focus'), 900)
}

function filteredItems(r) {
  const q = (r.item_name || '').trim().toLowerCase()
  if (!q) return items.value.slice(0, 5)
  return items.value.filter(i => i.name.toLowerCase().includes(q)).slice(0, 8)
}

function pickItem(r, item) {
  r.item_name = item.name
  if (item.default_unit) r.unit = item.default_unit
  if (item.last_price != null && r.unit_price === '') r.unit_price = String(item.last_price)
  r.showSuggest = false
  nextTick(() => {
    const qty = document.querySelector(`[data-qty="${r.key}"]`)
    if (qty) { qty.focus(); qty.select?.(); flash(qty); }
  })
}

function updateQty(r, delta) {
  const current = parseFloat(r.quantity) || 0
  const next = Math.max(0, current + delta)
  r.quantity = next
  if (delta > 0) {
    nextTick(() => {
      const price = document.querySelector(`[data-price="${r.key}"]`)
      if (price && !r.unit_price) flash(price)
    })
  }
}

function addRow() {
  rows.value.push(makeRow())
  nextTick(() => {
    const last = rows.value[rows.value.length - 1]
    const el = document.querySelector(`[data-name="${last.key}"]`)
    el?.focus(); flash(el)
  })
}

function removeRow(key) {
  if (rows.value.length === 1) { rows.value[0] = makeRow(); return }
  rows.value = rows.value.filter(r => r.key !== key)
}

function enableOverride(r) {
  r.isOverride = true
  if (!r.line_override) r.line_override = String(lineTotal(r) || '')
  nextTick(() => {
    const el = document.querySelector(`[data-override="${r.key}"]`)
    if (el) { el.focus(); el.select?.(); flash(el); }
  })
}

function resetOverride(r) {
  r.isOverride = false
  r.line_override = ''
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

/* --- Supplier Logic --- */
const showSupplierList = ref(false)
const supplierVisible = ref(5)
const supplierSearch = ref('')

const filteredSuppliers = computed(() => {
  const q = supplierSearch.value.trim().toLowerCase()
  if (!q) return supplierList.value
  return supplierList.value.filter(s => s.name.toLowerCase().includes(q))
})
const visibleSuppliers = computed(() => filteredSuppliers.value.slice(0, supplierVisible.value))
const hasMoreSuppliers = computed(() => filteredSuppliers.value.length > supplierVisible.value)

function openSupplierList() {
  showSupplierList.value = true
  supplierSearch.value = '' 
  supplierVisible.value = 5
}

function pickSupplier(s) {
  meta.supplier = s.name
  showSupplierList.value = false
}

function clearSupplier() { meta.supplier = '' }

/* --- New Supplier --- */
const showNewSupplier = ref(false)
const newSupplier = reactive({ name: '', phone: '' })

function openNewSupplier() {
  newSupplier.name = (meta.supplier || '').trim()
  newSupplier.phone = ''
  showNewSupplier.value = true
  showSupplierList.value = false
}

async function saveNewSupplier() {
  if (!newSupplier.name.trim()) return showToast('সাপ্লায়ারের নাম দিন')
  const payload = { 
    name: newSupplier.name.trim(), 
    phone: newSupplier.phone.trim() || null,
    restaurant_id: getActiveRestaurantId() // 🔥 যোগ করুন
  }
  const { error } = await supabase.from('suppliers').upsert(payload, { onConflict: 'name' })
  if (error) return showToast('যোগ হয়নি: ' + error.message)
  await loadSuppliers()
  meta.supplier = newSupplier.name.trim()
  showNewSupplier.value = false
  showToast('✅ নতুন সাপ্লায়ার যোগ হয়েছে')
}

/* --- Loaders & Save --- */
async function loadItems() {
  if (!profile.value) return
  const rid = getActiveRestaurantId()
  if (!rid) return
  const { data } = await supabase.from('items').select('*').eq('restaurant_id', rid).order('name')
  items.value = data || []
}

async function loadSuppliers() {
  if (!profile.value) return
  const rid = getActiveRestaurantId()
  if (!rid) return
  const { data } = await supabase.from('suppliers').select('*').eq('restaurant_id', rid).order('name')
  supplierList.value = data || []
}

async function loadStats() {
  if (!profile.value) return
  const rid = getActiveRestaurantId()
  if (!rid) return

  // ১. আজকের ডেটা
  const { data: tData } = await supabase
    .from('purchases')
    .select('total_price')
    .eq('restaurant_id', rid)
    .eq('purchase_date', todayISO())
  
  todaySummary.value = {
    count: (tData || []).length,
    total: (tData || []).reduce((s, p) => s + (Number(p.total_price) || 0), 0)
  }

  // ২. চলতি মাসের ডেটা (মাসের ১ তারিখ থেকে আজ পর্যন্ত)
  const d = new Date()
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  
  const { data: mData } = await supabase
    .from('purchases')
    .select('total_price, quantity, unit_price')
    .eq('restaurant_id', rid)
    .gte('purchase_date', firstDay)

  const monthTotal = (mData || []).reduce((s, p) => s + (Number(p.total_price) || 0), 0)
  monthlySummary.value = { total: monthTotal }

  // ৩. চলতি মাসের ম্যানুয়াল সাশ্রয় (Override করা লাইনগুলো)
  let savings = 0
  ;(mData || []).forEach(p => {
    const q = Number(p.quantity) || 0
    const up = Number(p.unit_price) || 0
    const total = Number(p.total_price) || 0
    // যেহেতু ডিসকাউন্টও total_price থেকে বাদ যায়, তাই একটু বাফার রাখা হলো
    const expected = q * up
    if (expected - total > 1) { // ১ টাকার বেশি পার্থক্য মানেই সেভ হয়েছে
      savings += (expected - total)
    }
  })
  totalSavingsMonth.value = savings
}

/* --- Save Logic --- */
async function saveMemo() {
  const valid = rows.value.filter(r => r.item_name.trim() && parseFloat(r.quantity) > 0)
  if (!valid.length && !meta.other_expense) return showToast('অন্তত একটি পণ্য বা অন্যান্য খরচ দিন')
  saving.value = true

  // ১. মোট সাবটোটাল
  const sub = valid.reduce((s, r) => s + lineTotal(r), 0)
  
  // ২. মোট গ্র্যান্ড টোটাল (যা ইউজারকে দিতে হবে)
  const finalTotal = grandTotal.value 
  const paid = finalPaid.value
  const due = dueAmount.value

  // ৩. প্রতিটি পণ্যের পেলোড তৈরি (ডিসকাউন্ট ও বাকি আনুপাতিক হারে ভাগ করা)
  const rowsToInsert = valid.map(r => {
    const lt = lineTotal(r)
    
    // টোটাল ডিসকাউন্টের শেয়ার
    let discountShare = 0
    if (sub > 0) discountShare = (discountAmount.value * (lt / sub))
    const itemFinalTotal = Math.max(0, +(lt - discountShare).toFixed(2))
    
    // বাকির শেয়ার (গ্র্যান্ড টোটালের ওপর ভিত্তি করে)
    let itemPaid = 0
    let itemDue = 0
    if (finalTotal > 0) {
      itemPaid = +(paid * (itemFinalTotal / finalTotal)).toFixed(2)
      itemDue = +(itemFinalTotal - itemPaid).toFixed(2)
    } else {
      itemPaid = itemFinalTotal
      itemDue = 0
    }

    return {
      item_name: r.item_name.trim(),
      quantity: parseFloat(r.quantity),
      unit: r.unit,
      unit_price: r.unit_price === '' ? null : parseFloat(r.unit_price),
      total_price: itemFinalTotal,
      paid_amount: itemPaid,
      due_amount: itemDue,
      supplier: meta.supplier.trim() || null,
      note: meta.note.trim() || null,
      purchase_date: meta.purchase_date,
      status: 'pending',
      restaurant_id: getActiveRestaurantId()
    }
  })

  // ৪. অন্যান্য খরচ থাকলে সেটিও যোগ করা
  if (otherExp.value > 0) {
    const expenseType = meta.other_expense_note.trim()
    const finalName = expenseType ? `অতিরিক্ত খরচ - ${expenseType}` : 'অতিরিক্ত খরচ'
    const expTotal = otherExp.value
    
    let expPaid = 0
    let expDue = 0
    if (finalTotal > 0) {
      expPaid = +(paid * (expTotal / finalTotal)).toFixed(2)
      expDue = +(expTotal - expPaid).toFixed(2)
    }

    rowsToInsert.push({
      item_name: finalName,
      quantity: 1,
      unit: 'বার',
      unit_price: expTotal,
      total_price: expTotal,
      paid_amount: expPaid,
      due_amount: expDue,
      supplier: meta.supplier.trim() || null,
      note: null,
      purchase_date: meta.purchase_date,
      status: 'pending',
      restaurant_id: getActiveRestaurantId()
    })
  }

  // ৫. ডেটাবেজে সেভ
  const { error } = await supabase.from('purchases').insert(rowsToInsert)
  if (error) { showToast('সেভ হয়নি: ' + error.message); saving.value = false; return }

  // সাপ্লায়ার আপডেট
  if (meta.supplier.trim()) {
    const exists = supplierList.value.some(s => s.name.toLowerCase() === meta.supplier.trim().toLowerCase())
    if (!exists) {
      await supabase.from('suppliers').upsert({ 
        name: meta.supplier.trim(),
        restaurant_id: getActiveRestaurantId()
      }, { onConflict: 'name' })
    }
  }

  // আইটেম লিস্ট আপডেট
  for (const r of valid) {
    const price = r.unit_price === '' ? null : parseFloat(r.unit_price)
    const payload = { 
      name: r.item_name.trim(), 
      default_unit: r.unit,
      restaurant_id: getActiveRestaurantId()
    }
    if (price != null) payload.last_price = price
    await supabase.from('items').upsert(payload, { onConflict: 'name' })
  }

  await Promise.all([loadItems(), loadSuppliers(), loadStats()])
  showToast(`✅ সফলভাবে সেভ হয়েছে`)
  
  // রিসেট
  rows.value = [makeRow()]
  meta.discount_value = ''
  meta.other_expense = ''
  meta.other_expense_note = ''
  meta.note = ''
  paidAmount.value = '' // পরিশোধ রিসেট
  
  saving.value = false
}

onMounted(async () => {
  // profile লোড হওয়ার জন্য অপেক্ষা
  if (!profile.value) {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (profile.value) {
          clearInterval(check)
          resolve()
        }
      }, 100)
      // সর্বোচ্চ ৩ সেকেন্ড অপেক্ষা
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
  }
  await loadItems()
  await loadSuppliers()
  await loadStats()
})



const paidAmount = ref('') // ইউজার যা টাকা দিবে
// const grandTotal = computed(() => Math.max(0, subtotal.value - discountAmount.value + otherExp.value))

// পরিশোধ ও বাকি হিসাব
const finalPaid = computed(() => {
  const p = parseFloat(paidAmount.value)
  if (isNaN(p) || p < 0) return 0
  return Math.min(p, grandTotal.value) // বিলের চেয়ে বেশি টাকা দিতে পারবে না
})
const dueAmount = computed(() => Math.max(0, grandTotal.value - finalPaid.value))


// const grandTotal = computed(() => Math.max(0, subtotal.value - discountAmount.value + otherExp.value))
// const paidAmount = ref('') 
const isManualPaid = ref(false) // ইউজার নিজে টাইপ করেছে কিনা ট্র্যাক করতে
// 🔥 জাদুকরি লজিক: বিল বাড়লে বা কমলে অটো সম্পূর্ণ টাকা বসে যাবে
watch(grandTotal, (newTotal) => {
  if (!isManualPaid.value) {
    paidAmount.value = newTotal > 0 ? String(newTotal) : ''
  }
})
// ইউজার ম্যানুয়ালি টাইপ করলে বাকি হিসাব হবে
function onPaidInput() {
  isManualPaid.value = true
  if (paidAmount.value === String(grandTotal.value)) {
    isManualPaid.value = false
  }
}
function setFullPaid() {
  isManualPaid.value = false
  paidAmount.value = String(grandTotal.value)
}





</script>

<template>
  <div class="px-3 pt-4 pb-6 space-y-4">

    <!-- STATS CARDS -->
    <div class="grid grid-cols-3 gap-2">
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-2 flex items-center gap-1.5">
        <div class="text-xl text-blue-600 bg-white rounded-lg p-1 shadow-sm shrink-0">🛒</div>
        <div class="min-w-0">
          <p class="text-[9px] text-slate-600 font-medium truncate">আজকের ক্রয়</p>
          <p class="text-[12px] font-bold text-slate-800 truncate">৳ {{ fmt(todaySummary.total) }}</p>
        </div>
      </div>
      <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-2 flex items-center gap-1.5">
        <div class="text-xl text-emerald-600 bg-white rounded-lg p-1 shadow-sm shrink-0">📈</div>
        <div class="min-w-0">
          <p class="text-[9px] text-slate-600 font-medium truncate">মাসিক ক্রয়</p>
          <p class="text-[12px] font-bold text-slate-800 truncate">৳ {{ fmt(monthlySummary.total) }}</p>
        </div>
      </div>
      <div class="bg-green-100 border border-green-200 rounded-xl p-2 flex items-center gap-1.5">
        <div class="text-xl text-green-700 bg-white rounded-lg p-1 shadow-sm shrink-0">💰</div>
        <div class="min-w-0">
          <p class="text-[9px] text-green-800 font-medium truncate">মাসিক সাশ্রয়</p>
          <p class="text-[12px] font-bold text-green-900 truncate">৳ {{ fmt(totalSavingsMonth) }}</p>
        </div>
      </div>
    </div>

    <!-- SUPPLIER & DATE -->
    <div class="grid grid-cols-2 gap-2">
      <div class="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm relative">
        <div class="flex items-center gap-1 mb-1.5 text-emerald-700">
          <span class="text-sm">🏪</span>
          <p class="text-[11px] font-bold">সাপ্লায়ার</p>
        </div>
        <div class="flex gap-1">
          <button @click="openSupplierList" class="flex-1 h-8 px-2 rounded-lg border border-slate-200 text-[12px] flex items-center justify-between bg-slate-50">
            <span class="truncate" :class="meta.supplier ? 'text-slate-800 font-semibold' : 'text-slate-400'">
              {{ meta.supplier || 'বাছাই করুন' }}
            </span>
            <span class="text-slate-400 text-[9px]">▼</span>
          </button>
          <button v-if="meta.supplier" @click="clearSupplier" class="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 shrink-0 flex items-center justify-center">✕</button>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
        <div class="flex items-center gap-1 mb-1.5 text-blue-700">
          <span class="text-sm">📅</span>
          <p class="text-[11px] font-bold">তারিখ-{{ formatDateBn(meta.purchase_date) }}</p>
        </div>
        <input v-model="meta.purchase_date" type="date" class="w-full h-8 px-1 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[12px] font-semibold text-slate-700" />
      </div>
    </div>

    <!-- SEARCH BAR -->
    <div class="relative" @click="openProductList">
      <div class="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 bg-white flex items-center shadow-sm cursor-pointer active:bg-slate-50">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <span class="text-slate-400 text-[14px]">পণ্য খুঁজুন বা তালিকা দেখুন...</span>
      </div>
    </div>

    <!-- ITEM LIST -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="grid grid-cols-12 gap-1 px-2 py-2 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-bold text-slate-500">
        <div class="col-span-6">পণ্য</div>
        <div class="col-span-2 text-center">পরিমাণ</div>
        <div class="col-span-2 text-right">দর</div>
        <div class="col-span-2 text-right pr-1">মোট</div>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="r in rows" :key="r.key" class="px-1.5 py-2 flex flex-col relative">
          
          <div class="grid grid-cols-12 gap-1 items-center">
            <!-- Name -->
            <div class="col-span-6 relative">
              <div class="flex items-center gap-1">
                <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-lg shrink-0 border border-slate-100">
                  {{ getIcon(r.item_name) }}
                </div>
                <div class="flex-1 min-w-0">
                  <input v-model="r.item_name" :data-name="r.key" type="text" placeholder="পণ্য..." class="w-full bg-transparent outline-none font-bold text-[13px] text-slate-800 placeholder-slate-400 truncate" @focus="r.showSuggest = true" @input="r.showSuggest = true" />
                  <button @click="r.showUnitSheet = true" class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold mt-0.5">
                    {{ r.unit }}
                  </button>
                </div>
              </div>
              
              <div v-if="r.showSuggest && filteredItems(r).length" class="fixed inset-0 z-10" @click="r.showSuggest = false"></div>
              <ul v-if="r.showSuggest && filteredItems(r).length" class="absolute z-20 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl overflow-auto max-h-40">
                <li v-for="item in filteredItems(r)" :key="item.id">
                  <button @click="pickItem(r, item)" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center text-[12px]">
                    <span class="font-medium">{{ item.name }}</span>
                  </button>
                </li>
              </ul>
            </div>

            <!-- Qty -->
            <div class="col-span-2">
              <div class="flex items-center border border-slate-200 rounded-lg h-8 overflow-hidden bg-white">
                <button @click="updateQty(r, -1)" class="w-5 h-full flex items-center justify-center text-slate-500 font-bold active:bg-slate-100 shrink-0">−</button>
                <input v-model="r.quantity" :data-qty="r.key" type="number" inputmode="decimal" class="w-full min-w-0 text-center outline-none text-[12px] font-bold text-slate-800 focus:bg-amber-50 px-0.5" />
                <button @click="updateQty(r, 1)" class="w-5 h-full flex items-center justify-center text-slate-500 font-bold active:bg-slate-100 shrink-0">+</button>
              </div>
            </div>

            <!-- Price -->
            <div class="col-span-2">
              <input v-model="r.unit_price" :data-price="r.key" type="number" inputmode="decimal" placeholder="0" class="w-full text-right bg-transparent outline-none text-[13px] font-medium text-slate-700 placeholder-slate-300 focus:border-b-2 focus:border-rose-400" />
            </div>

            <!-- Total -->
            <div class="col-span-2 flex items-center justify-end">
              <template v-if="!r.isOverride">
                <button @click="enableOverride(r)" :data-total="r.key" class="font-bold text-[13px] text-slate-900 rounded px-1 -mx-1">
                  {{ lineTotal(r) ? fmt(lineTotal(r)) : '0' }}
                </button>
              </template>
              <template v-else>
                <input v-model="r.line_override" :data-override="r.key" type="number" class="w-14 text-right bg-amber-50 border border-amber-300 rounded outline-none font-bold text-[13px] text-amber-900 px-1" />
                <button @click="resetOverride(r)" class="ml-1 text-[10px] bg-red-100 text-red-600 rounded px-1 py-0.5 active:scale-90" title="রিসেট">✕</button>
              </template>
            </div>
          </div>
          
          <button @click="removeRow(r.key)" class="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-50 text-red-500 text-[10px] flex items-center justify-center active:scale-90 border border-red-100">✕</button>

          <!-- Unit Picker -->
          <div v-if="r.showUnitSheet" class="fixed inset-0 z-50 bg-black/40 flex items-end" @click.self="r.showUnitSheet = false">
            <div class="w-full bg-white rounded-t-2xl p-4 pb-8">
              <p class="text-center font-bold mb-3 text-sm text-slate-800">একক বাছাই</p>
              <div class="grid grid-cols-4 gap-2">
                <button v-for="u in UNITS" :key="u" @click="r.unit = u; r.showUnitSheet = false" class="h-10 rounded-lg border text-[13px]" :class="r.unit === u ? 'bg-[#0b172a] text-white border-[#0b172a] font-bold' : 'bg-white border-slate-200 text-slate-700'">{{ u }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="p-2 bg-slate-50 border-t border-slate-200">
        <button @click="addRow" class="w-full h-10 rounded-lg border-2 border-dashed border-emerald-400 text-emerald-700 font-bold text-[13px] flex items-center justify-center gap-1 active:bg-emerald-50">
          <span class="text-lg leading-none">+</span> আরও পণ্য যোগ করুন
        </button>
      </div>
    </div>

    <!-- TOTALS SECTION -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex gap-3">
      <div class="w-[40%] bg-slate-50 rounded-xl flex flex-col items-center justify-center text-slate-700 p-2 border border-slate-200">
        <p class="text-[10px] font-medium text-slate-500 text-center leading-tight">সাশ্রয়ের সুযোগ</p>
        <p class="text-[18px] font-bold leading-tight mt-1 text-emerald-600">৳ {{ fmt(totalSavings) }}</p>
        <p class="text-[8px] text-slate-400 text-center leading-tight mt-1">(ম্যানুয়াল দাম কমানো)</p>
      </div>

      <div class="flex-1 space-y-2 text-[13px]">
        <div class="flex justify-between items-center">
          <span class="text-slate-500">মোট মূল্য</span>
          <span class="font-bold text-slate-800">৳ {{ fmt(subtotal) }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-slate-500">ডিসকাউন্ট</span>
          <div class="flex items-center gap-1">
            <input v-model="meta.discount_value" type="number" placeholder="0" class="w-12 h-7 px-1 rounded border border-slate-200 text-center font-bold outline-none" />
            <button @click="meta.discount_type = meta.discount_type === 'percent' ? 'flat' : 'percent'" class="w-7 h-7 rounded bg-slate-100 text-slate-600 font-bold text-[11px]">
              {{ meta.discount_type === 'percent' ? '%' : '৳' }}
            </button>
            <span class="font-bold text-emerald-600 w-12 text-right">-{{ fmt(discountAmount) }}</span>
          </div>
        </div>

        <!-- অন্যান্য খরচ -->
        <div class="flex justify-between items-center border-b border-slate-200 pb-2">
          <span class="text-slate-500 shrink-0">অন্যান্য খরচ</span>
          <div class="flex items-center gap-1">
            <span class="text-slate-400 font-bold">৳</span>
            <input v-model="meta.other_expense" type="number" placeholder="0" class="w-12 h-7 px-1 rounded border border-slate-200 text-right font-bold outline-none" />
            
            <div class="relative">
              <button @click="showExpenseDropdown = !showExpenseDropdown" class="w-[54px] h-7 rounded border border-slate-200 text-[10px] text-slate-600 flex items-center justify-between px-1 bg-white">
                <span class="truncate">{{ meta.other_expense_note || 'ধরন' }}</span>
                <span class="text-[8px]">▼</span>
              </button>
              <div v-if="showExpenseDropdown" class="fixed inset-0 z-10" @click="showExpenseDropdown = false"></div>
              <ul v-if="showExpenseDropdown" class="absolute right-0 bottom-full mb-1 w-28 bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-40 overflow-auto">
                <li v-for="type in EXPENSE_TYPES" :key="type">
                  <button @click="pickExpenseType(type)" class="w-full text-left px-2 py-1.5 text-[11px] hover:bg-slate-50 border-b border-slate-100 last:border-0">{{ type }}</button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-center pt-1">
          <span class="font-bold text-[14px] text-slate-800">সর্বমোট</span>
          <span class="font-bold text-[16px] text-white bg-[#0b172a] px-2 py-0.5 rounded-lg">৳ {{ fmt(grandTotal) }}</span>
        </div>

        <!-- পরিশোধ ও বাকি (সম্পূর্ণ নতুন ডিজাইন) -->
        <div class="pt-3 mt-2 border-t-2 border-dashed border-slate-300 space-y-3">
          
          <!-- পরিশোধ (Paid) -->
          <div class="flex justify-between items-center">
            <span class="text-slate-700 font-bold text-[13px]">পরিশোধ (Paid)</span>
            <div class="flex items-center gap-1.5">
              <div class="flex items-center bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                <span class="text-emerald-600 font-bold mr-1 text-[12px]">৳</span>
                <input 
                  v-model="paidAmount" 
                  @input="onPaidInput"
                  type="number" 
                  placeholder="0" 
                  class="w-16 bg-transparent text-right font-bold text-emerald-800 outline-none text-[14px]" 
                />
              </div>
              <button 
                @click="setFullPaid" 
                class="bg-emerald-600 text-white text-[11px] px-2.5 py-1.5 rounded-lg font-bold active:scale-95 shadow-sm"
              >সম্পূর্ণ</button>
            </div>
          </div>

          <!-- বাকি (Due) - শুধু টাকা কম দিলে দেখাবে -->
          <div v-if="dueAmount > 0" class="flex justify-between items-center bg-red-50 p-2 rounded-lg border border-red-100">
            <span class="text-red-700 font-bold text-[13px]">⚠️ বাকি (Due)</span>
            <span class="font-bold text-[15px] text-red-600">৳ {{ fmt(dueAmount) }}</span>
          </div>
          
          <!-- সম্পূর্ণ পরিশোধ হলে সবুজ টিক -->
          <div v-else-if="grandTotal > 0 && dueAmount === 0" class="flex items-center gap-1.5 text-emerald-600 text-[11px] justify-end">
            <span>✅</span> <span class="font-bold">সম্পূর্ণ পরিশোধিত</span>
          </div>
        </div>


      </div>
    </div>

    <!-- ACTIONS -->
    <div class="flex gap-2">
      <button @click="saveMemo" :disabled="saving" class="w-full bg-emerald-600 rounded-xl h-12 flex items-center justify-center gap-2 text-white font-bold text-[15px] shadow-lg active:scale-[0.98] disabled:opacity-60">
        <span>✓</span> {{ saving ? 'সেভ হচ্ছে...' : 'নিশ্চিত করুন' }}
      </button>
    </div>

  </div>

  <!-- 🔥 NEW: Product List Sheet (Grid & Grouped) -->
  <div v-if="showProductList" class="fixed inset-0 z-50 bg-black/40 flex items-end" @click.self="showProductList = false">
    <div class="w-full bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
      <div class="px-4 pt-3 pb-2 border-b border-slate-200">
        <div class="flex items-center justify-between mb-2">
          <p class="text-[14px] font-bold text-slate-800">পণ্য তালিকা</p>
          <button @click="showProductList = false" class="text-slate-400 text-lg">✕</button>
        </div>
        
        <!-- Search & Add New Row -->
        <div class="flex gap-2">
          <input v-model="productSearch" type="search" placeholder="🔍 পণ্য খুঁজুন..." class="flex-1 h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 outline-none text-[13px]" />
          <button @click="showNewItemForm = true; productSearch = ''" class="h-10 px-3 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-[13px] flex items-center gap-1 active:scale-95 shrink-0">
            <span class="text-base leading-none">+</span> নতুন
          </button>
        </div>
      </div>

      <!-- Inline Add New Item Form -->
      <div v-if="showNewItemForm" class="p-3 bg-emerald-50 border-b border-emerald-200">
        <p class="text-[11px] font-bold text-emerald-800 mb-1.5">নতুন পণ্য যোগ করুন</p>
        <div class="flex gap-2">
          <input v-model="newItemForm.name" type="text" placeholder="পণ্যের নাম" class="flex-1 h-9 px-2 rounded-md border border-emerald-200 bg-white text-[13px] outline-none focus:border-emerald-500" />
          <select v-model="newItemForm.unit" class="h-9 px-1 rounded-md border border-emerald-200 bg-white text-[12px] outline-none">
            <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
          </select>
          <button @click="saveNewItem" :disabled="addingItem" class="h-9 px-3 rounded-md bg-emerald-600 text-white text-[12px] font-bold active:scale-95 disabled:opacity-60 shrink-0">
            {{ addingItem ? '...' : 'সেভ' }}
          </button>
          <button @click="showNewItemForm = false" class="h-9 px-2 rounded-md bg-white border border-slate-200 text-slate-500 text-[12px] active:scale-95 shrink-0">
            ✕
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-3">
        <!-- Grouped Grid View -->
        <div v-for="group in visibleGroupedProducts" :key="group.letter" class="mb-3">
          <p class="text-[11px] font-bold text-slate-400 mb-1.5 border-b border-slate-100 pb-1">{{ group.letter }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button 
              v-for="item in group.items" 
              :key="item.id" 
              @click="pickProductFromList(item)" 
              class="text-left p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 flex items-center gap-2"
            >
              <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-lg shrink-0 border border-slate-100">
                {{ getIcon(item.name) }}
              </div>
              <div class="min-w-0">
                <p class="text-[12px] font-bold text-slate-800 truncate">{{ item.name }}</p>
                <p class="text-[10px] text-slate-500">{{ item.default_unit }}</p>
              </div>
            </button>
          </div>
        </div>

        <div v-if="hasMoreProducts" class="p-2">
          <button @click="productVisible += 15" class="w-full h-10 rounded-lg border border-slate-200 text-[13px] text-slate-700 font-medium bg-slate-50 active:bg-slate-100">আরও দেখান</button>
        </div>
        <div v-if="!visibleGroupedProducts.length" class="text-center py-8 text-slate-400 text-sm">কোনো পণ্য পাওয়া যায়নি</div>
      </div>
    </div>
  </div>

  <!-- Supplier List Sheet -->
  <div v-if="showSupplierList" class="fixed inset-0 z-50 bg-black/40 flex items-end" @click.self="showSupplierList = false">
    <div class="w-full bg-white rounded-t-2xl max-h-[75vh] flex flex-col">
      <div class="px-4 pt-3 pb-2 border-b border-slate-200">
        <div class="flex items-center justify-between mb-2">
          <p class="text-[14px] font-bold text-slate-800">সাপ্লায়ার বাছাই</p>
          <button @click="showSupplierList = false" class="text-slate-400 text-lg">✕</button>
        </div>
        <input v-model="supplierSearch" type="search" placeholder="🔍 নাম দিয়ে খুঁজুন..." class="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 outline-none text-[13px]" />
      </div>

      <div class="flex-1 overflow-auto">
        <button v-for="s in visibleSuppliers" :key="s.id" @click="pickSupplier(s)" class="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 flex justify-between items-center">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-100 grid place-items-center text-emerald-700 font-bold text-[13px] shrink-0">{{ s.name.charAt(0) }}</div>
            <div>
              <p class="text-[14px] font-medium text-slate-800">{{ s.name }}</p>
              <p v-if="s.phone" class="text-[11px] text-slate-500">📱 {{ s.phone }}</p>
            </div>
          </div>
          <span class="text-slate-300">›</span>
        </button>

        <div v-if="hasMoreSuppliers" class="p-3">
          <button @click="supplierVisible += 5" class="w-full h-10 rounded-lg border border-slate-200 text-[13px] text-slate-700 font-medium bg-slate-50 active:bg-slate-100">আরও দেখান</button>
        </div>
      </div>

      <div class="p-3 border-t border-slate-200 pb-6">
        <button @click="openNewSupplier" class="w-full h-11 rounded-lg bg-emerald-600 text-white font-semibold text-[13px] active:scale-[0.98]">+ নতুন সাপ্লায়ার যোগ করুন</button>
      </div>
    </div>
  </div>

  <!-- Add New Supplier Modal -->
  <div v-if="showNewSupplier" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
      <p class="text-center font-bold text-slate-800">নতুন সাপ্লায়ার</p>
      <input v-model="newSupplier.name" type="text" placeholder="নাম *" class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[14px] outline-none" />
      <input v-model="newSupplier.phone" type="tel" placeholder="মোবাইল নম্বর" class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[14px] outline-none" />
      <div class="flex gap-2">
        <button @click="showNewSupplier = false" class="flex-1 h-10 rounded-lg bg-slate-100 text-slate-600 font-semibold text-[13px]">বাতিল</button>
        <button @click="saveNewSupplier" class="flex-1 h-10 rounded-lg bg-emerald-600 text-white font-semibold text-[13px]">সেভ করুন</button>
      </div>
    </div>
  </div>

  <transition name="fade">
    <div v-if="toast" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">{{ toast }}</div>
  </transition>
</template>

<style scoped>
.flash-focus {
  animation: flash-focus 0.9s ease-out;
}
@keyframes flash-focus {
  0%   { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.55); border-color: rgba(37, 99, 235, 1); }
  40%  { box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.15); border-color: rgba(37, 99, 235, 0.3); }
  100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); border-color: transparent; }
}
</style>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'
import { formatDateBn } from '../utils/dateFormat'

const { profile } = useAuth()

const suppliersList = ref([]) 

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
}

function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

const purchases = ref([])
const supplierPhones = ref({})
const loading = ref(true)
const saving = ref(false)
const selectedDate = ref(todayISO())

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

const totalSum = computed(() =>
  purchases.value.reduce((s, p) => s + (Number(p.total_price) || 0), 0)
)

const totalDue = computed(() =>
  purchases.value.reduce((s, p) => s + (Number(p.due_amount) || 0), 0)
)

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

async function remove(id) {
  if (!confirm('এই লাইনটি মুছে ফেলবেন?')) return
  await supabase.from('purchases').delete().eq('id', id)
  await load()
}

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
  const expected = q * up
  return Math.abs(expected - total) > 0.5
}

function adjustmentOf(p) {
  const q = Number(p.quantity) || 0
  const up = Number(p.unit_price) || 0
  const total = Number(p.total_price) || 0
  return total - q * up
}



// ড্রাফট স্টেট
const drafts = ref([])
const showDraftModal = ref(false)
const selectedDraftId = ref(null)
const draftItems = ref([])

// ড্রাফট লোড ফাংশন
async function loadDrafts() {
  const rid = getActiveRestaurantId()
  if (!rid) return
  const { data, error } = await supabase
    .from('purchase_drafts')
    .select('*')
    .eq('restaurant_id', rid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  
  if (!error) {
    drafts.value = data || []
  }
}

// ড্রাফট ওপেন করা
function openDraft(draft) {
  selectedDraftId.value = draft.id
  draftItems.value = JSON.parse(JSON.stringify(draft.items))
  showDraftModal.value = true
}

// ড্রাফট নিশ্চিত করা (সেভ)
async function confirmDraft() {
  saving.value = true
  
  const rowsToInsert = draftItems.value.map(p => {
    const price = Number(p.max_price) || 0
    const qty = Number(p.quantity) || 1
    const total = price * qty
    
    return {
      item_name: p.item_name,
      quantity: qty,
      unit: p.unit,
      unit_price: price,
      total_price: total,
      paid_amount: total,
      due_amount: 0,
      supplier: p.supplier || null,
      note: 'ড্রাফট থেকে যোগ করা হয়েছে',
      purchase_date: selectedDate.value,
      status: 'pending',
      restaurant_id: getActiveRestaurantId()
    }
  })

  const { error } = await supabase.from('purchases').insert(rowsToInsert)
  if (error) { 
    showToast('সেভ হয়নি: ' + error.message)
    saving.value = false
    return 
  }

  await supabase.from('purchase_drafts').delete().eq('id', selectedDraftId.value)
  
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
  <div class="px-3 pt-3 space-y-3">
    <input v-model="selectedDate" type="date" @change="load" class="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 outline-none text-sm" />


<!-- 🔥 ড্রাফট লিস্ট সেকশন -->
<div v-if="drafts.length" class="bg-blue-50 border border-blue-200 rounded-xl p-3 shadow-sm space-y-2">
  <p class="text-[12px] font-bold text-blue-800 flex items-center gap-1">
    <span>📝</span> সেভ করা বাজার লিস্ট
  </p>
  <div v-for="d in drafts" :key="d.id" class="flex justify-between items-center bg-white p-2 rounded-lg border border-blue-100">
    <div>
      <p class="text-[12px] font-bold text-slate-700">{{ d.items.length }} টি পণ্য</p>
      <p class="text-[10px] text-slate-500">{{ new Date(d.created_at).toLocaleDateString('bn-BD') }}</p>
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

    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">


      <!-- Memo header -->
      <div class="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <p class="text-[12px] font-bold text-slate-700 text-center">🧾 দৈনিক ক্রয় মেমো -- {{ formatDateBn(selectedDate) }}</p>
      </div>

      <!-- Column header -->
      <div class="grid grid-cols-12 gap-1 px-2.5 py-1.5 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
        <div class="col-span-5">পণ্য</div>
        <div class="col-span-2 text-center">পরিমাণ</div>
        <div class="col-span-2 text-right">দর</div>
        <div class="col-span-2 text-right">মোট</div>
        <div class="col-span-1"></div>
      </div>

      <!-- Supplier groups -->
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

        <!-- Item rows -->
        <div v-for="p in g.list" :key="p.id" class="grid grid-cols-12 gap-1 px-2.5 py-2 items-center text-[12px] border-b border-slate-100 last:border-b-0" :class="isAdjusted(p) ? 'bg-amber-50/60' : ''">
          
          <!-- আপনার নতুন স্টাইল করা নাম ও ডিসকাউন্ট সেকশন -->
          <div class="col-span-5 min-w-0">
            <p class="font-medium text-slate-800 truncate">
              {{ p.item_name }} 
              <span v-if="isAdjusted(p)" class="text-[10px] text-amber-700 font-medium truncate"> 
                <span v-if="adjustmentOf(p) < 0">({{ fmt(Math.abs(adjustmentOf(p))) }} কম)</span>
                <span v-else>(+{{ fmt(adjustmentOf(p)) }})</span>  
              </span>
              <span v-if="isAdjusted(p)" class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle ml-1"></span>
            </p>
            <p v-if="p.note" class="text-[10px] text-slate-400 truncate">📝 {{ p.note }}</p>
          </div>

          <div class="col-span-2 text-center" :class="isAdjusted(p) ? 'text-amber-800' : 'text-slate-700'">
            {{ p.quantity }} <span class="text-[10px]" :class="isAdjusted(p) ? 'text-amber-500' : 'text-slate-400'">{{ p.unit }}</span>
          </div>

          <div class="col-span-2 text-right" :class="isAdjusted(p) ? 'text-amber-700' : 'text-slate-600'">
            {{ p.unit_price ? fmt(p.unit_price) : '—' }}
          </div>

          <!-- Total & Due per item -->
          <div class="col-span-2 text-right">
            <p class="font-semibold" :class="isAdjusted(p) ? 'text-amber-900' : 'text-slate-900'">
              {{ p.total_price ? fmt(p.total_price) : '—' }}
            </p>
            <!-- <p v-if="Number(p.due_amount) > 0" class="text-[9px] font-bold text-red-500 mt-0.5">
              বাকি: {{ fmt(p.due_amount) }}
            </p> -->
          </div>

          <div class="col-span-1 text-right">
            <button @click="remove(p.id)" class="text-slate-300 text-sm active:text-red-500">✕</button>
          </div>
        </div>

        <!-- Subtotal -->
        <div class="grid grid-cols-12 gap-1 px-2.5 py-1.5 bg-slate-50 text-[11px] border-b border-slate-200">
          <div class="col-span-9 text-slate-500">সাবটোটাল — {{ g.supplier }}</div>
          <div class="col-span-3 text-right">
            <p class="font-semibold text-slate-700">৳ {{ fmt(g.total) }}</p>
            <p v-if="g.due > 0" class="text-[9px] font-bold text-red-500">বাকি: ৳{{ fmt(g.due) }}</p>
          </div>
        </div>

      </div>

      <!-- Grand Total -->
      <div class="grid grid-cols-12 gap-1 px-2.5 py-3 bg-slate-900 text-white items-center">
        <div class="col-span-9">
          <p class="text-[11px] text-white/70">সর্বমোট ({{ purchases.length }} আইটেম)</p>
          <p v-if="totalDue > 0" class="text-[10px] text-red-400 font-bold mt-0.5">মোট বাকি: ৳ {{ fmt(totalDue) }}</p>
        </div>
        <div class="col-span-3 text-right text-[18px] font-bold">
          ৳ {{ fmt(totalSum) }}
        </div>
      </div>
    </div>

    <div v-if="purchases.some(isAdjusted)" class="flex items-center gap-2 text-[11px] text-slate-500 px-1">
      <span class="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200"></span>
      <span>দাম ঠিক করা / ডিসকাউন্ট প্রয়োগ হয়েছে</span>
    </div>
    <div class="h-2"></div>
  </div>

<!-- 🔥 ড্রাফট কনফার্ম মডাল -->
<div v-if="showDraftModal" class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" @click.self="showDraftModal = false">
  <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
    
    <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
      <div>
        <p class="text-[14px] font-bold text-slate-800">বাজার নিশ্চিত করুন</p>
        <p class="text-[11px] text-slate-500">প্রয়োজনে দাম এডিট করে সেভ করুন</p>
      </div>
      <button @click="showDraftModal = false" class="text-slate-400 text-lg">✕</button>
    </div>

    <div class="p-2 overflow-auto flex-1 bg-slate-50">
  <!-- হেডার (কলাম নাম) -->
  <div class="grid grid-cols-12 gap-1 px-1 py-1.5 bg-slate-200 rounded-t text-[10px] font-bold text-slate-600 mb-1">
    <div class="col-span-3">পণ্য</div>
    <div class="col-span-2 text-center">পরিমাণ</div>
    <div class="col-span-2 text-right">দর (৳)</div>
    <div class="col-span-2 text-right">মোট (৳)</div>
    <div class="col-span-3 pl-1">সাপ্লায়ার</div>
  </div>

  <!-- আইটেম লিস্ট -->
  <div class="space-y-1.5">
    <div v-for="(p, i) in draftItems" :key="i" class="grid grid-cols-12 gap-1 items-center bg-white p-1.5 rounded-lg shadow-sm border border-slate-200">
      
      <!-- ১. পণ্যের নাম -->
      <div class="col-span-3 min-w-0">
        <p class="text-[11px] font-bold text-slate-800 truncate">{{ p.item_name }}</p>
        <p class="text-[8px] text-slate-400">{{ p.unit }}</p>
      </div>

      <!-- ২. পরিমাণ -->
      <div class="col-span-2">
        <input v-model="p.quantity" type="number" inputmode="decimal" class="w-full h-7 px-1 border border-slate-300 rounded text-[11px] text-center font-bold outline-none focus:border-blue-500" />
      </div>

      <!-- ৩. দর -->
      <div class="col-span-2">
        <input v-model="p.max_price" type="number" inputmode="decimal" class="w-full h-7 px-1 border border-slate-300 rounded text-[11px] text-right font-bold outline-none focus:border-blue-500" />
      </div>

      <!-- ৪. লাইন মোট (এডিটযোগ্য) -->
      <div class="col-span-2">
        <input 
          v-model="p.line_total" 
          type="number" 
          inputmode="decimal" 
          placeholder="0"
          class="w-full h-7 px-1 border border-amber-300 bg-amber-50 rounded text-[11px] text-right font-bold text-amber-900 outline-none focus:border-amber-500" 
        />
      </div>

      <!-- ৫. সাপ্লায়ার (ছোট ড্রপডাউন) -->
      <div class="col-span-3 pl-0.5">
        <select v-model="p.supplier" class="w-full h-7 px-1 border border-slate-300 rounded text-[9px] bg-white outline-none focus:border-blue-500 truncate">
          <option value="">ছাড়া</option>
          <option v-for="s in suppliersList" :key="s.id" :value="s.name">{{ s.name }}</option>
        </select>
      </div>

    </div>
  </div>

    </div>

    <div class="p-4 border-t border-slate-100 flex gap-2 bg-slate-50 rounded-b-2xl">
      <button @click="showDraftModal = false" class="flex-1 h-11 rounded-xl bg-slate-200 text-slate-700 font-bold text-[13px]">বাতিল</button>
      <button @click="confirmDraft" :disabled="saving" class="flex-[2] h-11 rounded-xl bg-emerald-600 text-white font-bold text-[13px] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
        <span>✓</span> {{ saving ? 'সেভ হচ্ছে...' : 'সব কিনেছি (সেভ করুন)' }}
      </button>
    </div>
  </div>
</div>


</template>
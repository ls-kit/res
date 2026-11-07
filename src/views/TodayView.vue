<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'

const { profile } = useAuth()

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
    supabase.from('suppliers').select('name, phone').eq('restaurant_id', rid)
  ])

  if (!purchasesRes.error) purchases.value = purchasesRes.data || []

  if (!suppliersRes.error) {
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
})
</script>

<template>
  <div class="px-3 pt-3 space-y-3">
    <input v-model="selectedDate" type="date" @change="load" class="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 outline-none text-sm" />

    <div v-if="loading" class="text-center text-slate-400 py-10 text-sm">লোড হচ্ছে...</div>

    <div v-else-if="!purchases.length" class="text-center py-14">
      <p class="text-5xl mb-3">🧾</p>
      <p class="text-slate-500 text-sm">এই দিনে কোনো কেনাকাটা নেই</p>
    </div>

    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <!-- Memo header -->
      <div class="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <p class="text-[12px] font-bold text-slate-700 text-center">🧾 দৈনিক ক্রয় মেমো</p>
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
</template>
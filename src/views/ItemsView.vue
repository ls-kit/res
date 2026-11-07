<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

const UNITS = ['কেজি', 'গ্রাম', 'পিস', 'লিটার', 'মিলি', 'ডজন', 'বস্তা', 'প্যাকেট']


function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
}

const activeTab = ref('items')

/* items */
const items = ref([])
const itemsLoading = ref(true)
const itemForm = ref({ name: '', default_unit: 'কেজি', last_price: '' })
const itemSearch = ref('')

/* suppliers */
const suppliers = ref([])
const suppliersLoading = ref(true)
const supplierForm = ref({ name: '', phone: '', address: '' })
const supplierSearch = ref('')
const editingSupplier = ref(null)

const saving = ref(false)
const toast = ref('')

const filteredItemsList = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(q))
})

const filteredSuppliersList = computed(() => {
  const q = supplierSearch.value.trim().toLowerCase()
  if (!q) return suppliers.value
  return suppliers.value.filter(
    s =>
      s.name.toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
  )
})

// function fmt(n) {
//   return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
// }

function showToast(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

/* items API */
async function loadItems() {
  itemsLoading.value = true
  const { data } = await supabase.from('items').select('*').order('name')
  items.value = data || []
  itemsLoading.value = false
}

async function addItem() {
  if (!itemForm.value.name.trim()) return showToast('পণ্যের নাম দিন')
  saving.value = true
  const payload = {
    name: itemForm.value.name.trim(),
    default_unit: itemForm.value.default_unit
  }
  if (itemForm.value.last_price !== '') {
    payload.last_price = parseFloat(itemForm.value.last_price)
  }
  const { error } = await supabase.from('items').upsert(payload, { onConflict: 'name' })
  saving.value = false
  if (error) return showToast('যোগ হয়নি: ' + error.message)
  itemForm.value = { name: '', default_unit: 'কেজি', last_price: '' }
  await loadItems()
  showToast('✅ পণ্য যোগ হয়েছে')
}

async function removeItem(id) {
  if (!confirm('পণ্যটি মুছবেন?')) return
  await supabase.from('items').delete().eq('id', id)
  await loadItems()
}

/* suppliers API */
async function loadSuppliers() {
  suppliersLoading.value = true
  const { data } = await supabase.from('suppliers').select('*').order('name')
  suppliers.value = data || []
  suppliersLoading.value = false
}

async function saveSupplier() {
  if (!supplierForm.value.name.trim()) return showToast('নাম দিন')
  saving.value = true
  const payload = {
    name: supplierForm.value.name.trim(),
    phone: supplierForm.value.phone.trim() || null,
    address: supplierForm.value.address.trim() || null
  }
  let error
  if (editingSupplier.value) {
    ;({ error } = await supabase
      .from('suppliers')
      .update(payload)
      .eq('id', editingSupplier.value))
  } else {
    ;({ error } = await supabase
      .from('suppliers')
      .upsert(payload, { onConflict: 'name' }))
  }
  saving.value = false
  if (error) return showToast('সেভ হয়নি: ' + error.message)
  supplierForm.value = { name: '', phone: '', address: '' }
  editingSupplier.value = null
  await loadSuppliers()
  showToast('✅ সাপ্লায়ার সেভ হয়েছে')
}

function editSupplier(s) {
  editingSupplier.value = s.id
  supplierForm.value = { name: s.name, phone: s.phone || '', address: s.address || '' }
  activeTab.value = 'suppliers'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEdit() {
  editingSupplier.value = null
  supplierForm.value = { name: '', phone: '', address: '' }
}

async function removeSupplier(id) {
  if (!confirm('সাপ্লায়ার মুছবেন?')) return
  await supabase.from('suppliers').delete().eq('id', id)
  await loadSuppliers()
}

onMounted(() => {
  loadItems()
  loadSuppliers()
})
</script>

<template>
  <div class="px-3 pt-3 space-y-3">

    <!-- Tabs -->
    <div class="grid grid-cols-2 bg-white rounded-lg p-1 border border-slate-200">
      <button
        @click="activeTab = 'items'"
        class="h-9 rounded-md text-[13px] font-semibold transition"
        :class="activeTab === 'items' ? 'bg-brand text-white' : 'text-slate-600'"
      >📦 পণ্য</button>
      <button
        @click="activeTab = 'suppliers'"
        class="h-9 rounded-md text-[13px] font-semibold transition"
        :class="activeTab === 'suppliers' ? 'bg-emerald-600 text-white' : 'text-slate-600'"
      >🏪 সাপ্লায়ার</button>
    </div>

    <!-- ITEMS -->
    <template v-if="activeTab === 'items'">
      <div class="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
        <p class="text-[13px] font-bold text-slate-700">নতুন পণ্য</p>
        <input
          v-model="itemForm.name"
          type="text"
          placeholder="পণ্যের নাম"
          class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[14px] focus:border-brand focus:bg-white"
        />
        <div class="grid grid-cols-2 gap-2">
          <select
            v-model="itemForm.default_unit"
            class="h-10 px-2 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[14px]"
          >
            <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
          </select>
          <input
            v-model="itemForm.last_price"
            type="number"
            inputmode="decimal"
            placeholder="শেষ দাম ৳"
            class="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[14px] focus:border-brand focus:bg-white"
          />
        </div>
        <button
          @click="addItem"
          :disabled="saving"
          class="w-full h-10 rounded-lg bg-brand text-white font-semibold text-[13px] active:scale-[0.98] transition disabled:opacity-60"
        >+ যোগ করুন</button>
      </div>

      <input
        v-model="itemSearch"
        type="search"
        placeholder="🔍 পণ্য খুঁজুন..."
        class="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 outline-none text-[13px]"
      />

      <!-- Table -->
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="grid grid-cols-12 gap-1 px-2.5 py-2 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
          <div class="col-span-6">পণ্য</div>
          <div class="col-span-3 text-center">একক</div>
          <div class="col-span-2 text-right">শেষ দাম</div>
          <div class="col-span-1"></div>
        </div>

        <div v-if="itemsLoading" class="text-center text-slate-400 py-6 text-sm">লোড হচ্ছে...</div>
        <div v-else-if="!filteredItemsList.length" class="text-center py-8 text-slate-400 text-sm">
          কোনো পণ্য নেই
        </div>
        <div v-else class="divide-y divide-slate-100">
          <div
            v-for="item in filteredItemsList"
            :key="item.id"
            class="grid grid-cols-12 gap-1 px-2.5 py-2 items-center text-[12px]"
          >
            <div class="col-span-6 font-medium text-slate-800 truncate">{{ item.name }}</div>
            <div class="col-span-3 text-center text-slate-600">{{ item.default_unit || '—' }}</div>
            <div class="col-span-2 text-right text-slate-700 font-medium">
              {{ item.last_price ? fmt(item.last_price) : '—' }}
            </div>
            <div class="col-span-1 text-right">
              <button
                @click="removeItem(item.id)"
                class="text-slate-300 text-sm active:text-red-500"
              >✕</button>
            </div>
          </div>
        </div>
      </div>

      <p class="text-[11px] text-slate-500 text-center">
        মোট {{ filteredItemsList.length }} টি পণ্য
      </p>
    </template>

    <!-- SUPPLIERS -->
    <template v-if="activeTab === 'suppliers'">
      <div class="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
        <div class="flex items-center justify-between">
          <p class="text-[13px] font-bold text-slate-700">
            {{ editingSupplier ? 'সাপ্লায়ার সম্পাদনা' : 'নতুন সাপ্লায়ার' }}
          </p>
          <button
            v-if="editingSupplier"
            @click="cancelEdit"
            class="text-[11px] text-slate-500"
          >বাতিল</button>
        </div>
        <input
          v-model="supplierForm.name"
          type="text"
          placeholder="নাম *"
          class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[14px] focus:border-emerald-500 focus:bg-white"
        />
        <input
          v-model="supplierForm.phone"
          type="tel"
          inputmode="tel"
          placeholder="মোবাইল নম্বর"
          class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[14px] focus:border-emerald-500 focus:bg-white"
        />
        <input
          v-model="supplierForm.address"
          type="text"
          placeholder="ঠিকানা (ঐচ্ছিক)"
          class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[14px] focus:border-emerald-500 focus:bg-white"
        />
        <button
          @click="saveSupplier"
          :disabled="saving"
          class="w-full h-10 rounded-lg bg-emerald-600 text-white font-semibold text-[13px] active:scale-[0.98] transition disabled:opacity-60"
        >
          {{ editingSupplier ? '✓ আপডেট' : '+ যোগ করুন' }}
        </button>
      </div>

      <input
        v-model="supplierSearch"
        type="search"
        placeholder="🔍 নাম বা ফোন..."
        class="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 outline-none text-[13px]"
      />

      <!-- Table -->
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="grid grid-cols-12 gap-1 px-2.5 py-2 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
          <div class="col-span-6">নাম</div>
          <div class="col-span-4 text-center">মোবাইল</div>
          <div class="col-span-2 text-right">অ্যাকশন</div>
        </div>

        <div v-if="suppliersLoading" class="text-center text-slate-400 py-6 text-sm">লোড হচ্ছে...</div>
        <div v-else-if="!filteredSuppliersList.length" class="text-center py-8 text-slate-400 text-sm">
          কোনো সাপ্লায়ার নেই
        </div>
        <div v-else class="divide-y divide-slate-100">
          <div
            v-for="s in filteredSuppliersList"
            :key="s.id"
            class="grid grid-cols-12 gap-1 px-2.5 py-2.5 items-center text-[12px]"
          >
            <div class="col-span-6 min-w-0">
              <p class="font-medium text-slate-800 truncate">{{ s.name }}</p>
              <p v-if="s.address" class="text-[10px] text-slate-400 truncate">
                {{ s.address }}
              </p>
            </div>
            <div class="col-span-4 text-center">
              <a
                v-if="s.phone"
                :href="`tel:${s.phone}`"
                class="text-emerald-700 font-medium text-[11px]"
              >📱 {{ s.phone }}</a>
              <span v-else class="text-slate-300 text-[11px]">—</span>
            </div>
            <div class="col-span-2 flex items-center justify-end gap-1.5">
              <button
                @click="editSupplier(s)"
                class="text-slate-400 text-base active:text-brand"
                title="এডিট"
              >✎</button>
              <button
                @click="removeSupplier(s.id)"
                class="text-slate-300 text-sm active:text-red-500"
              >✕</button>
            </div>
          </div>
        </div>
      </div>

      <p class="text-[11px] text-slate-500 text-center">
        মোট {{ filteredSuppliersList.length }} জন সাপ্লায়ার
      </p>
    </template>

    <div class="h-2"></div>
  </div>

  <transition name="fade">
    <div
      v-if="toast"
      class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap"
    >
      {{ toast }}
    </div>
  </transition>
</template>
import { ref } from 'vue'
import { supabase } from '../supabase'

const user = ref(null)
const profile = ref(null)

export function useAuth() {
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await fetchProfile(data.user.id)
  }

  const signup = async (email, password, name, restaurantName) => {
    // নতুন রেস্টুরেন্ট সাইনআপ (Admin)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email, password, options: { data: { name } }
    })
    if (authError) throw authError

    const { data: restData, error: restError } = await supabase
      .from('restaurants').insert({ name: restaurantName }).select().single()
    if (restError) throw restError

    const { error: profileError } = await supabase
      .from('profiles').update({ restaurant_id: restData.id, role: 'admin', name: name }).eq('id', authData.user.id)
    if (profileError) throw profileError

    await fetchProfile(authData.user.id)
  }

  // 🔥 নতুন: অ্যাডমিন তার রেস্টুরেন্টে নতুন ম্যানেজার/স্টাফ যোগ করবে
  const addStaff = async (email, password, name, restaurant_id) => {
    // নোট: এখানে Supabase Admin API লাগবে, কিন্তু ফ্রন্টএন্ড থেকে ইউজার তৈরি করার জন্য আমরা 
    // একটি আলাদা Supabase Function ব্যবহার করতে পারি অথবা আপাতত ডেমো হিসেবে auth.signUp করাতে পারি। 
    // তবে সবচেয়ে সহজ ও নিরাপদ উপায় হলো Supabase Dashboard থেকে ইউজার বানানো।
    
    // আপাতত আমরা ডেমো হিসেবে ইউজার তৈরি করছি (এটি লগআউট করে দিতে পারে, তাই সাধারণত ব্যাকএন্ড API ব্যবহার করা ভালো)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email, password, options: { data: { name } }
    })
    if (authError) throw authError

    const { error: profileError } = await supabase
      .from('profiles').update({ restaurant_id, role: 'staff', name }).eq('id', authData.user.id)
    if (profileError) throw profileError
  }

  const logout = async () => {
    await supabase.auth.signOut()
    user.value = null
    profile.value = null
  }

  const fetchProfile = async (userId) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user.value = authUser
    if (authUser) {
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      profile.value = data
    }
  }

  return { user, profile, login, signup, addStaff, logout, fetchProfile }
}
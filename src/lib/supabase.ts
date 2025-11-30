import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://eigfbxjheuwxmtdfnvqc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZ2ZieGpoZXV3eG10ZGZudnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDQ4NjEsImV4cCI6MjA4MDAyMDg2MX0.ilFCYkPxz8qJ3Yaw9Lt14JvdFlUsENKLYWXLYrHO8vA'

export const supabase = createClient(supabaseUrl, supabaseKey)

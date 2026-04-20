import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lzelizmlujgrgxwafgjm.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6ZWxpem1sdWpncmd4d2FmZ2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1OTY1MjcsImV4cCI6MjA5MjE3MjUyN30.61uR5oQUo10vLDVyElTl-xiNDVmmkblsVUmd3awBwQg'

export const supabase = createClient(supabaseUrl, supabaseKey)

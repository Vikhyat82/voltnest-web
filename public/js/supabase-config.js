/* Public browser configuration for Supabase.
   Get these from: Supabase Dashboard → Project Settings → API
   - Project URL (e.g. https://xyzcompany.supabase.co)
   - Project API anon/public key (e.g. eyJhbGciOi...)
   Never place a service_role key here. */
window.SUPABASE_CONFIG = {
  supabaseUrl: 'https://hefwvrojvybwwsxannyl.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlZnd2cm9qdnlid3dzeGFubnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTAzMzcsImV4cCI6MjEwODE4NjMzN30.oMDN-pfTky106ITTfDTVvSyik8ZvgofoDJiBj5Giy4E',
  whatsappNumber: '' // Optional: e.g. '919876543210' for direct WhatsApp confirmations
};

// Backwards-compatibility alias for Campus Circuit scripts:
window.CAMPUS_CIRCUIT_CONFIG = window.SUPABASE_CONFIG;

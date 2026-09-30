/**
 * Minimal Supabase database type stubs.
 * Replace with the full generated output from:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      characters:       { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      episodes:         { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      scenes:           { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      outfits:          { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      locations:        { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      reference_assets: { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      usage_records:    { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
      user_settings:    { Row: Record<string,Json>; Insert: Record<string,Json>; Update: Record<string,Json> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

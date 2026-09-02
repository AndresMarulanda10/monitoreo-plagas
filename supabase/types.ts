export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      monitoring_configurations: {
        Row: { id: string; lot_name: string; crop_name: string; bed_count: number; plants_per_bed: number; created_at: string };
        Insert: Omit<Database['public']['Tables']['monitoring_configurations']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['monitoring_configurations']['Insert']>;
      };
      organisms: {
        Row: { id: string; name: string; created_at: string };
        Insert: Omit<Database['public']['Tables']['organisms']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['organisms']['Insert']>;
      };
      reviews: {
        Row: {
          id: string;
          configuration_id: string;
          review_week: string;
          review_date: string;
          observer_id: string;
          review_slot: 1 | 2;
          status: 'draft' | 'submitted';
          current_version: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reviews']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
      };
      review_versions: {
        Row: {
          review_id: string;
          version: number;
          status: 'draft' | 'submitted';
          correction_of_version: number | null;
          correction_reason: string | null;
          submitted_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['review_versions']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['review_versions']['Insert']>;
      };
      observations: {
        Row: { review_id: string; version: number; plant_id: string; organism_id: string; severity: 0 | 1 | 2 | 3 };
        Insert: Database['public']['Tables']['observations']['Row'];
        Update: Partial<Database['public']['Tables']['observations']['Insert']>;
      };
      metrics: {
        Row: {
          id: string;
          review_id: string;
          version: number;
          organism_id: string;
          grain: 'review' | 'bed' | 'crop' | 'configuration';
          incidence_numerator: number;
          incidence_denominator: number;
          severity_numerator: number;
          severity_denominator: number;
          formula_version: 'metrics.v1';
          incidence_percent: number;
          severity_percent: number;
          calculated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['metrics']['Row'], 'id'> & { id?: string };
        Update: never;
      };
    };
  };
};

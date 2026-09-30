export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_seat_id: string | null
          actor_user_id: string | null
          after: Json | null
          at: string
          before: Json | null
          event_id: string | null
          id: string
          reason: string | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_seat_id?: string | null
          actor_user_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          event_id?: string | null
          id?: string
          reason?: string | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_seat_id?: string | null
          actor_user_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          event_id?: string | null
          id?: string
          reason?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      divisions: {
        Row: {
          created_at: string
          draw: Json | null
          draw_locked_at: string | null
          event_id: string
          format_params: Json
          format_template_id: string | null
          id: string
          name: string
          panel_id: string | null
          rules_unlocked_at: string | null
          scoring_model_id: string | null
          scoring_overrides: Json
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draw?: Json | null
          draw_locked_at?: string | null
          event_id: string
          format_params?: Json
          format_template_id?: string | null
          id?: string
          name: string
          panel_id?: string | null
          rules_unlocked_at?: string | null
          scoring_model_id?: string | null
          scoring_overrides?: Json
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draw?: Json | null
          draw_locked_at?: string | null
          event_id?: string
          format_params?: Json
          format_template_id?: string | null
          id?: string
          name?: string
          panel_id?: string | null
          rules_unlocked_at?: string | null
          scoring_model_id?: string | null
          scoring_overrides?: Json
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_format_template_id_fkey"
            columns: ["format_template_id"]
            isOneToOne: false
            referencedRelation: "format_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_scoring_model_id_fkey"
            columns: ["scoring_model_id"]
            isOneToOne: false
            referencedRelation: "scoring_models"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          consent_at: string | null
          created_at: string
          division_id: string
          event_id: string
          id: string
          identifiers: Json
          paid: boolean
          rider_id: string
          seed: number | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          division_id: string
          event_id: string
          id?: string
          identifiers?: Json
          paid?: boolean
          rider_id: string
          seed?: number | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          division_id?: string
          event_id?: string
          id?: string
          identifiers?: Json
          paid?: boolean
          rider_id?: string
          seed?: number | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          branding: Json
          created_at: string
          end_date: string | null
          id: string
          join_pin_hash: string | null
          location: string | null
          name: string
          organisation_id: string
          settings: Json
          slug: string
          start_date: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          end_date?: string | null
          id?: string
          join_pin_hash?: string | null
          location?: string | null
          name: string
          organisation_id: string
          settings?: Json
          slug: string
          start_date?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          end_date?: string | null
          id?: string
          join_pin_hash?: string | null
          location?: string | null
          name?: string
          organisation_id?: string
          settings?: Json
          slug?: string
          start_date?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_attempts: {
        Row: {
          at: string
          event_id: string
          id: string
          ip: string
          kind: string
        }
        Insert: {
          at?: string
          event_id: string
          id?: string
          ip: string
          kind: string
        }
        Update: {
          at?: string
          event_id?: string
          id?: string
          ip?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_attempts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      format_templates: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          json: Json
          key: string
          name: string
          organisation_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          id?: string
          json: Json
          key: string
          name: string
          organisation_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          json?: Json
          key?: string
          name?: string
          organisation_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "format_templates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      heat_results: {
        Row: {
          breakdown: Json | null
          created_at: string
          entry_id: string
          event_id: string
          heat_id: string
          id: string
          percent: number | null
          place: number | null
          published_at: string
          total: number | null
          version: number
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string
          entry_id: string
          event_id: string
          heat_id: string
          id?: string
          percent?: number | null
          place?: number | null
          published_at?: string
          total?: number | null
          version?: number
        }
        Update: {
          breakdown?: Json | null
          created_at?: string
          entry_id?: string
          event_id?: string
          heat_id?: string
          id?: string
          percent?: number | null
          place?: number | null
          published_at?: string
          total?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "heat_results_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_results_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_results_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
        ]
      }
      heat_slots: {
        Row: {
          breakdown: Json | null
          created_at: string
          entry_id: string | null
          event_id: string
          flagged_out: boolean
          heat_id: string
          id: string
          modifier: string | null
          place: number | null
          position: number
          source: Json | null
          total: number | null
          updated_at: string
          vest_colour: string | null
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string
          entry_id?: string | null
          event_id: string
          flagged_out?: boolean
          heat_id: string
          id?: string
          modifier?: string | null
          place?: number | null
          position: number
          source?: Json | null
          total?: number | null
          updated_at?: string
          vest_colour?: string | null
        }
        Update: {
          breakdown?: Json | null
          created_at?: string
          entry_id?: string | null
          event_id?: string
          flagged_out?: boolean
          heat_id?: string
          id?: string
          modifier?: string | null
          place?: number | null
          position?: number
          source?: Json | null
          total?: number | null
          updated_at?: string
          vest_colour?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_slots_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_slots_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_slots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_slots_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
        ]
      }
      heats: {
        Row: {
          created_at: string
          division_id: string
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_total_sec: number
          publish_hold: boolean
          published_at: string | null
          round_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id: string
          duration_sec?: number
          ended_at?: string | null
          event_id: string
          flag_out?: Json | null
          id?: string
          live_rev?: number
          manual_override?: boolean
          number: number
          number_suffix?: string | null
          paused_at?: string | null
          paused_total_sec?: number
          publish_hold?: boolean
          published_at?: string | null
          round_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: string
          duration_sec?: number
          ended_at?: string | null
          event_id?: string
          flag_out?: Json | null
          id?: string
          live_rev?: number
          manual_override?: boolean
          number?: number
          number_suffix?: string | null
          paused_at?: string | null
          paused_total_sec?: number
          publish_hold?: boolean
          published_at?: string | null
          round_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "heats_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heats_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      impression_scores: {
        Row: {
          client_key: string
          client_rev: number
          created_at: string
          entry_id: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          updated_at: string
          value: number
        }
        Insert: {
          client_key: string
          client_rev?: number
          created_at?: string
          entry_id: string
          event_id: string
          heat_id: string
          id?: string
          judge_seat_id: string
          updated_at?: string
          value: number
        }
        Update: {
          client_key?: string
          client_rev?: number
          created_at?: string
          entry_id?: string
          event_id?: string
          heat_id?: string
          id?: string
          judge_seat_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "impression_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impression_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impression_scores_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impression_scores_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impression_scores_judge_seat_id_fkey"
            columns: ["judge_seat_id"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      join_attempts: {
        Row: {
          at: string
          event_id: string
          id: string
          ip: string
          ok: boolean
          seat_id: string | null
        }
        Insert: {
          at?: string
          event_id: string
          id?: string
          ip: string
          ok: boolean
          seat_id?: string | null
        }
        Update: {
          at?: string
          event_id?: string
          id?: string
          ip?: string
          ok?: boolean
          seat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "join_attempts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_seats: {
        Row: {
          active: boolean
          auth_user_id: string | null
          bound_at: string | null
          created_at: string
          device_label: string | null
          event_id: string
          id: string
          locked: boolean
          name: string
          pin_hash: string | null
          qr_token_expires_at: string | null
          qr_token_hash: string | null
          role: string
          scores: boolean
          spotter_assignment: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          bound_at?: string | null
          created_at?: string
          device_label?: string | null
          event_id: string
          id?: string
          locked?: boolean
          name: string
          pin_hash?: string | null
          qr_token_expires_at?: string | null
          qr_token_hash?: string | null
          role: string
          scores?: boolean
          spotter_assignment?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          bound_at?: string | null
          created_at?: string
          device_label?: string | null
          event_id?: string
          id?: string
          locked?: boolean
          name?: string
          pin_hash?: string | null
          qr_token_expires_at?: string | null
          qr_token_hash?: string | null
          role?: string
          scores?: boolean
          spotter_assignment?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organisation_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          branding: Json
          created_at: string
          id: string
          name: string
          plan: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          id?: string
          name: string
          plan?: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          id?: string
          name?: string
          plan?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      panel_members: {
        Row: {
          created_at: string
          event_id: string
          id: string
          judge_seat_id: string
          panel_id: string
          seat_no: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          judge_seat_id: string
          panel_id: string
          seat_no: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          judge_seat_id?: string
          panel_id?: string
          seat_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_members_judge_seat_id_fkey"
            columns: ["judge_seat_id"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_members_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "panels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      penalties: {
        Row: {
          created_at: string
          entry_id: string
          event_id: string
          heat_id: string
          id: string
          issued_by: string | null
          reason: string | null
          type: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          entry_id: string
          event_id: string
          heat_id: string
          id?: string
          issued_by?: string | null
          reason?: string | null
          type: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          entry_id?: string
          event_id?: string
          heat_id?: string
          id?: string
          issued_by?: string | null
          reason?: string | null
          type?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "penalties_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
        ]
      }
      presets: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          json: Json
          key: string
          kind: string
          name: string
          organisation_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          id?: string
          json: Json
          key: string
          kind: string
          name: string
          organisation_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          json?: Json
          key?: string
          kind?: string
          name?: string
          organisation_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "presets_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          created_at: string
          dob: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          nationality: string | null
          organisation_id: string
          phone: string | null
          photo_url: string | null
          sponsor: string | null
          updated_at: string
          woo_id: string | null
        }
        Insert: {
          created_at?: string
          dob?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          nationality?: string | null
          organisation_id: string
          phone?: string | null
          photo_url?: string | null
          sponsor?: string | null
          updated_at?: string
          woo_id?: string | null
        }
        Update: {
          created_at?: string
          dob?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          nationality?: string | null
          organisation_id?: string
          phone?: string | null
          photo_url?: string | null
          sponsor?: string | null
          updated_at?: string
          woo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "riders_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          division_id: string
          event_id: string
          id: string
          name: string
          short_name: string | null
          sort_order: number
          spec: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id: string
          event_id: string
          id?: string
          name: string
          short_name?: string | null
          sort_order?: number
          spec?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: string
          event_id?: string
          id?: string
          name?: string
          short_name?: string | null
          sort_order?: number
          spec?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_plans: {
        Row: {
          active: boolean
          actual_starts: Json
          anchors: Json
          created_at: string
          day: string
          defaults: Json
          event_id: string
          hold: Json | null
          id: string
          items: Json
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          actual_starts?: Json
          anchors?: Json
          created_at?: string
          day: string
          defaults?: Json
          event_id: string
          hold?: Json | null
          id?: string
          items?: Json
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          actual_starts?: Json
          anchors?: Json
          created_at?: string
          day?: string
          defaults?: Json
          event_id?: string
          hold?: Json | null
          id?: string
          items?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_models: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          json: Json
          key: string
          name: string
          organisation_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          id?: string
          json: Json
          key: string
          name: string
          organisation_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          json?: Json
          key?: string
          name?: string
          organisation_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoring_models_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      trick_attempts: {
        Row: {
          category_key: string | null
          client_key: string
          created_at: string
          created_by_seat: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string | null
          entry_id: string
          event_id: string
          heat_id: string
          height_m: number | null
          id: string
          input_method: string
          possible_duplicate_of: string | null
          raw_text: string | null
          seq: number
          status: string
          trick_name: string | null
          trick_parts: Json
          updated_at: string
          video_ts: number | null
        }
        Insert: {
          category_key?: string | null
          client_key: string
          created_at?: string
          created_by_seat?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string | null
          entry_id: string
          event_id: string
          heat_id: string
          height_m?: number | null
          id?: string
          input_method?: string
          possible_duplicate_of?: string | null
          raw_text?: string | null
          seq: number
          status: string
          trick_name?: string | null
          trick_parts?: Json
          updated_at?: string
          video_ts?: number | null
        }
        Update: {
          category_key?: string | null
          client_key?: string
          created_at?: string
          created_by_seat?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string | null
          entry_id?: string
          event_id?: string
          heat_id?: string
          height_m?: number | null
          id?: string
          input_method?: string
          possible_duplicate_of?: string | null
          raw_text?: string | null
          seq?: number
          status?: string
          trick_name?: string | null
          trick_parts?: Json
          updated_at?: string
          video_ts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trick_attempts_created_by_seat_fkey"
            columns: ["created_by_seat"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_attempts_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_attempts_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_attempts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_attempts_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_attempts_possible_duplicate_of_fkey"
            columns: ["possible_duplicate_of"]
            isOneToOne: false
            referencedRelation: "trick_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      trick_scores: {
        Row: {
          attempt_id: string
          client_key: string
          client_rev: number
          created_at: string
          criteria: Json
          edit_reason: string | null
          edited_by: string | null
          event_id: string
          flag: string | null
          heat_id: string
          id: string
          judge_seat_id: string
          missed: boolean
          score: number | null
          updated_at: string
          version: number
        }
        Insert: {
          attempt_id: string
          client_key: string
          client_rev?: number
          created_at?: string
          criteria?: Json
          edit_reason?: string | null
          edited_by?: string | null
          event_id: string
          flag?: string | null
          heat_id: string
          id?: string
          judge_seat_id: string
          missed?: boolean
          score?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          attempt_id?: string
          client_key?: string
          client_rev?: number
          created_at?: string
          criteria?: Json
          edit_reason?: string | null
          edited_by?: string | null
          event_id?: string
          flag?: string | null
          heat_id?: string
          id?: string
          judge_seat_id?: string
          missed?: boolean
          score?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trick_scores_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "trick_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_scores_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_scores_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_scores_judge_seat_id_fkey"
            columns: ["judge_seat_id"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      trick_vocabularies: {
        Row: {
          content_hash: string
          created_at: string
          event_id: string | null
          id: string
          json: Json
          key: string
          organisation_id: string | null
          updated_at: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          event_id?: string | null
          id?: string
          json: Json
          key: string
          organisation_id?: string | null
          updated_at?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          event_id?: string | null
          id?: string
          json?: Json
          key?: string
          organisation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trick_vocabularies_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trick_vocabularies_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      wind_calls: {
        Row: {
          created_at: string
          event_id: string
          id: string
          message: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          message?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          message?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wind_calls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_entries: {
        Row: {
          division_id: string | null
          event_id: string | null
          first_name: string | null
          id: string | null
          identifiers: Json | null
          last_name: string | null
          nationality: string | null
          photo_url: string | null
          seed: number | null
          sponsor: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_attempt: {
        Args: {
          p_category_key?: string
          p_client_key: string
          p_direction?: string
          p_entry: string
          p_heat: string
          p_height_m?: number
          p_input_method?: string
          p_override_reason?: string
          p_raw_text?: string
          p_status: string
          p_trick_name?: string
          p_trick_parts?: Json
        }
        Returns: {
          category_key: string | null
          client_key: string
          created_at: string
          created_by_seat: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string | null
          entry_id: string
          event_id: string
          heat_id: string
          height_m: number | null
          id: string
          input_method: string
          possible_duplicate_of: string | null
          raw_text: string | null
          seq: number
          status: string
          trick_name: string | null
          trick_parts: Json
          updated_at: string
          video_ts: number | null
        }
        SetofOptions: {
          from: "*"
          to: "trick_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attempt_counts: {
        Args: { p_heat: string }
        Returns: {
          cap: number
          entry_id: string
          used: number
        }[]
      }
      bind_seat_by_pin: {
        Args: { p_event: string; p_ip: string; p_pin: string; p_user: string }
        Returns: Json
      }
      bind_seat_by_token: {
        Args: { p_event: string; p_ip: string; p_token: string; p_user: string }
        Returns: Json
      }
      delete_attempt: {
        Args: { p_attempt: string; p_reason: string }
        Returns: {
          category_key: string | null
          client_key: string
          created_at: string
          created_by_seat: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string | null
          entry_id: string
          event_id: string
          heat_id: string
          height_m: number | null
          id: string
          input_method: string
          possible_duplicate_of: string | null
          raw_text: string | null
          seq: number
          status: string
          trick_name: string | null
          trick_parts: Json
          updated_at: string
          video_ts: number | null
        }
        SetofOptions: {
          from: "*"
          to: "trick_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_public_live_heat: { Args: { p_heat: string }; Returns: Json }
      purge_organisation: { Args: { p_org: string }; Returns: undefined }
      register_rider: {
        Args: {
          p_consent: boolean
          p_division: string
          p_event_slug: string
          p_fields: Json
          p_identifiers: Json
          p_ip: string
        }
        Returns: Json
      }
      request_seat: {
        Args: {
          p_event_slug: string
          p_ip: string
          p_name: string
          p_role: string
        }
        Returns: Json
      }
      rls_coverage: {
        Args: never
        Returns: {
          anon_can_select: boolean
          anon_can_write: boolean
          authenticated_can_write: boolean
          policy_count: number
          rls_enabled: boolean
          table_name: string
        }[]
      }
      set_publish_hold: {
        Args: { p_heat: string; p_hold: boolean; p_reason?: string }
        Returns: undefined
      }
      set_seat_pin: {
        Args: { p_pin: string; p_seat: string }
        Returns: undefined
      }
      set_seat_qr: {
        Args: { p_expires: string; p_seat: string; p_token: string }
        Returns: undefined
      }
      submit_impression: {
        Args: {
          p_client_key: string
          p_client_rev: number
          p_entry: string
          p_heat: string
          p_value: number
        }
        Returns: {
          client_key: string
          client_rev: number
          created_at: string
          entry_id: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          updated_at: string
          value: number
        }
        SetofOptions: {
          from: "*"
          to: "impression_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_trick_score: {
        Args: {
          p_attempt: string
          p_client_key: string
          p_client_rev: number
          p_criteria: Json
          p_flag: string
          p_missed: boolean
          p_score: number
        }
        Returns: {
          attempt_id: string
          client_key: string
          client_rev: number
          created_at: string
          criteria: Json
          edit_reason: string | null
          edited_by: string | null
          event_id: string
          flag: string | null
          heat_id: string
          id: string
          judge_seat_id: string
          missed: boolean
          score: number | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "trick_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unlock_division_rules: {
        Args: { p_division: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

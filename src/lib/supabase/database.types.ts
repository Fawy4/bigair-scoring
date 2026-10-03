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
      ask_log: {
        Row: {
          answer: string
          budget_tokens: number
          cache_read_tokens: number
          cache_write_tokens: number
          cited: string | null
          context: Json
          cost_usd: number
          created_at: string
          event_id: string | null
          id: string
          input_tokens: number
          ip_hash: string | null
          model: string | null
          organisation_id: string | null
          output_tokens: number
          pages: string[]
          question: string
          rating: string | null
          role: string
          route: string
          seat_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          answer?: string
          budget_tokens?: number
          cache_read_tokens?: number
          cache_write_tokens?: number
          cited?: string | null
          context?: Json
          cost_usd?: number
          created_at?: string
          event_id?: string | null
          id?: string
          input_tokens?: number
          ip_hash?: string | null
          model?: string | null
          organisation_id?: string | null
          output_tokens?: number
          pages?: string[]
          question: string
          rating?: string | null
          role: string
          route: string
          seat_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          answer?: string
          budget_tokens?: number
          cache_read_tokens?: number
          cache_write_tokens?: number
          cited?: string | null
          context?: Json
          cost_usd?: number
          created_at?: string
          event_id?: string | null
          id?: string
          input_tokens?: number
          ip_hash?: string | null
          model?: string | null
          organisation_id?: string | null
          output_tokens?: number
          pages?: string[]
          question?: string
          rating?: string | null
          role?: string
          route?: string
          seat_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ask_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_log_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_log_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_flags: {
        Row: {
          attempt_id: string
          client_key: string
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          kind: string
          note: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          client_key: string
          created_at?: string
          event_id: string
          heat_id: string
          id?: string
          judge_seat_id: string
          kind: string
          note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          client_key?: string
          created_at?: string
          event_id?: string
          heat_id?: string
          id?: string
          judge_seat_id?: string
          kind?: string
          note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_flags_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "trick_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_flags_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_flags_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_flags_judge_seat_id_fkey"
            columns: ["judge_seat_id"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
        ]
      }
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
          organisation_id: string | null
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
          organisation_id?: string | null
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
          organisation_id?: string | null
          reason?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      divisions: {
        Row: {
          created_at: string
          description: string | null
          draw: Json | null
          draw_at_lock: Json | null
          draw_locked_at: string | null
          event_id: string
          format_params: Json
          format_template_id: string | null
          id: string
          identification: Json | null
          live_settings: Json
          name: string
          panel_id: string | null
          rules_unlocked_at: string | null
          scoring_model_id: string | null
          scoring_overrides: Json
          seed_shuffle_seed: number | null
          sort_order: number
          status: string
          trick_base: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          draw?: Json | null
          draw_at_lock?: Json | null
          draw_locked_at?: string | null
          event_id: string
          format_params?: Json
          format_template_id?: string | null
          id?: string
          identification?: Json | null
          live_settings?: Json
          name: string
          panel_id?: string | null
          rules_unlocked_at?: string | null
          scoring_model_id?: string | null
          scoring_overrides?: Json
          seed_shuffle_seed?: number | null
          sort_order?: number
          status?: string
          trick_base?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          draw?: Json | null
          draw_at_lock?: Json | null
          draw_locked_at?: string | null
          event_id?: string
          format_params?: Json
          format_template_id?: string | null
          id?: string
          identification?: Json | null
          live_settings?: Json
          name?: string
          panel_id?: string | null
          rules_unlocked_at?: string | null
          scoring_model_id?: string | null
          scoring_overrides?: Json
          seed_shuffle_seed?: number | null
          sort_order?: number
          status?: string
          trick_base?: Json
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
          decline_reason: string | null
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
          decline_reason?: string | null
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
          decline_reason?: string | null
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
      event_reset_snapshots: {
        Row: {
          event_id: string
          expires_at: string
          id: string
          organisation_id: string
          payload: Json
          restored_at: string | null
          taken_at: string
          taken_by: string | null
        }
        Insert: {
          event_id: string
          expires_at?: string
          id?: string
          organisation_id: string
          payload: Json
          restored_at?: string | null
          taken_at?: string
          taken_by?: string | null
        }
        Update: {
          event_id?: string
          expires_at?: string
          id?: string
          organisation_id?: string
          payload?: Json
          restored_at?: string | null
          taken_at?: string
          taken_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reset_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          archived_at: string | null
          branding: Json
          created_at: string
          end_date: string | null
          id: string
          is_simulation: boolean
          join_pin_hash: string | null
          location: string | null
          name: string
          organisation_id: string
          settings: Json
          simulation_of: string | null
          slug: string
          start_date: string | null
          status: string
          timezone: string
          trick_vocabulary_version: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          branding?: Json
          created_at?: string
          end_date?: string | null
          id?: string
          is_simulation?: boolean
          join_pin_hash?: string | null
          location?: string | null
          name: string
          organisation_id: string
          settings?: Json
          simulation_of?: string | null
          slug: string
          start_date?: string | null
          status?: string
          timezone?: string
          trick_vocabulary_version?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          branding?: Json
          created_at?: string
          end_date?: string | null
          id?: string
          is_simulation?: boolean
          join_pin_hash?: string | null
          location?: string | null
          name?: string
          organisation_id?: string
          settings?: Json
          simulation_of?: string | null
          slug?: string
          start_date?: string | null
          status?: string
          timezone?: string
          trick_vocabulary_version?: number | null
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
          {
            foreignKeyName: "events_simulation_of_fkey"
            columns: ["simulation_of"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_notes: {
        Row: {
          author_role: string
          author_user_id: string | null
          body: string
          created_at: string
          division_id: string | null
          division_name: string | null
          done_at: string | null
          event_id: string | null
          event_name: string | null
          exported_at: string | null
          heat_id: string | null
          heat_label: string | null
          id: string
          organisation_id: string | null
          organisation_name: string | null
          page: string
          page_label: string
          screenshot_path: string | null
          status: string
          tag: string
          updated_at: string
        }
        Insert: {
          author_role: string
          author_user_id?: string | null
          body: string
          created_at?: string
          division_id?: string | null
          division_name?: string | null
          done_at?: string | null
          event_id?: string | null
          event_name?: string | null
          exported_at?: string | null
          heat_id?: string | null
          heat_label?: string | null
          id?: string
          organisation_id?: string | null
          organisation_name?: string | null
          page: string
          page_label: string
          screenshot_path?: string | null
          status?: string
          tag?: string
          updated_at?: string
        }
        Update: {
          author_role?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          division_id?: string | null
          division_name?: string | null
          done_at?: string | null
          event_id?: string | null
          event_name?: string | null
          exported_at?: string | null
          heat_id?: string | null
          heat_label?: string | null
          id?: string
          organisation_id?: string | null
          organisation_name?: string | null
          page?: string
          page_label?: string
          screenshot_path?: string | null
          status?: string
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_notes_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_notes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_notes_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_notes_organisation_id_fkey"
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
          published_at: string | null
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
          published_at?: string | null
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
          published_at?: string | null
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
      heat_decisions: {
        Row: {
          at: string
          by_seat: string | null
          by_user: string | null
          event_id: string
          heat_id: string
          id: string
          kind: string
          payload: Json
          reason: string | null
        }
        Insert: {
          at?: string
          by_seat?: string | null
          by_user?: string | null
          event_id: string
          heat_id: string
          id?: string
          kind: string
          payload?: Json
          reason?: string | null
        }
        Update: {
          at?: string
          by_seat?: string | null
          by_user?: string | null
          event_id?: string
          heat_id?: string
          id?: string
          kind?: string
          payload?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_decisions_by_seat_fkey"
            columns: ["by_seat"]
            isOneToOne: false
            referencedRelation: "judge_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_decisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_decisions_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
        ]
      }
      heat_reset_records: {
        Row: {
          event_id: string
          heat_id: string
          id: string
          payload: Json
          reason: string | null
          taken_at: string
          taken_by: string | null
        }
        Insert: {
          event_id: string
          heat_id: string
          id?: string
          payload: Json
          reason?: string | null
          taken_at?: string
          taken_by?: string | null
        }
        Update: {
          event_id?: string
          heat_id?: string
          id?: string
          payload?: Json
          reason?: string | null
          taken_at?: string
          taken_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_reset_records_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        Insert: {
          armed_at?: string | null
          armed_paused_at?: string | null
          created_at?: string
          division_id: string
          draw_uid?: string | null
          duration_sec?: number
          ended_at?: string | null
          event_id: string
          flag_out?: Json | null
          id?: string
          live_rev?: number
          manual_override?: boolean
          name?: string | null
          number: number
          number_suffix?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          paused_total_sec?: number
          prestart_sec?: number | null
          public_live?: boolean | null
          publish_hold?: boolean
          published_at?: string | null
          reopened_at?: string | null
          rerun_of?: string | null
          round_id: string
          started_at?: string | null
          status?: string
          time_scale?: number
          updated_at?: string
          warm_up_sec?: number
        }
        Update: {
          armed_at?: string | null
          armed_paused_at?: string | null
          created_at?: string
          division_id?: string
          draw_uid?: string | null
          duration_sec?: number
          ended_at?: string | null
          event_id?: string
          flag_out?: Json | null
          id?: string
          live_rev?: number
          manual_override?: boolean
          name?: string | null
          number?: number
          number_suffix?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          paused_total_sec?: number
          prestart_sec?: number | null
          public_live?: boolean | null
          publish_hold?: boolean
          published_at?: string | null
          reopened_at?: string | null
          rerun_of?: string | null
          round_id?: string
          started_at?: string | null
          status?: string
          time_scale?: number
          updated_at?: string
          warm_up_sec?: number
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
            foreignKeyName: "heats_rerun_of_fkey"
            columns: ["rerun_of"]
            isOneToOne: false
            referencedRelation: "heats"
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
          missed: boolean | null
          updated_at: string
          value: number | null
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
          missed?: boolean | null
          updated_at?: string
          value?: number | null
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
          missed?: boolean | null
          updated_at?: string
          value?: number | null
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
          last_seen_at: string | null
          locked: boolean
          name: string
          phone: string | null
          pin_enc: string | null
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
          last_seen_at?: string | null
          locked?: boolean
          name: string
          phone?: string | null
          pin_enc?: string | null
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
          last_seen_at?: string | null
          locked?: boolean
          name?: string
          phone?: string | null
          pin_enc?: string | null
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
      judge_sheets: {
        Row: {
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          reopened_at: string | null
          reopened_reason: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          heat_id: string
          id?: string
          judge_seat_id: string
          reopened_at?: string | null
          reopened_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          heat_id?: string
          id?: string
          judge_seat_id?: string
          reopened_at?: string | null
          reopened_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_sheets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_sheets_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_sheets_judge_seat_id_fkey"
            columns: ["judge_seat_id"]
            isOneToOne: false
            referencedRelation: "judge_seats"
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
          archived_at: string | null
          ask_monthly_budget: number
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
          archived_at?: string | null
          ask_monthly_budget?: number
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
          archived_at?: string | null
          ask_monthly_budget?: number
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
      platform_admins: {
        Row: {
          created_at: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_impersonations: {
        Row: {
          admin_user_id: string
          ended_at: string | null
          expires_at: string
          id: string
          organisation_id: string
          started_at: string
        }
        Insert: {
          admin_user_id: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          organisation_id: string
          started_at?: string
        }
        Update: {
          admin_user_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          organisation_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_impersonations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: []
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
          published_at: string | null
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
          published_at?: string | null
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
          published_at?: string | null
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
      release_check_ticks: {
        Row: {
          check_key: string
          check_text: string
          ticked_at: string
          ticked_by: string | null
          version: string
        }
        Insert: {
          check_key: string
          check_text: string
          ticked_at?: string
          ticked_by?: string | null
          version: string
        }
        Update: {
          check_key?: string
          check_text?: string
          ticked_at?: string
          ticked_by?: string | null
          version?: string
        }
        Relationships: []
      }
      release_signoffs: {
        Row: {
          checks_total: number
          tested_at: string
          tested_by: string | null
          version: string
        }
        Insert: {
          checks_total: number
          tested_at?: string
          tested_by?: string | null
          version: string
        }
        Update: {
          checks_total?: number
          tested_at?: string
          tested_by?: string | null
          version?: string
        }
        Relationships: []
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
          hand_pins: Json | null
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
          hand_pins?: Json | null
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
          hand_pins?: Json | null
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
          published_at: string | null
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
          published_at?: string | null
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
          published_at?: string | null
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
      sensor_bindings: {
        Row: {
          bound_at: string
          created_at: string
          device_serial: string | null
          entry_id: string
          event_id: string
          external_user_id: string | null
          id: string
          provider: string
          unbound_at: string | null
          updated_at: string
        }
        Insert: {
          bound_at?: string
          created_at?: string
          device_serial?: string | null
          entry_id: string
          event_id: string
          external_user_id?: string | null
          id?: string
          provider: string
          unbound_at?: string | null
          updated_at?: string
        }
        Update: {
          bound_at?: string
          created_at?: string
          device_serial?: string | null
          entry_id?: string
          event_id?: string
          external_user_id?: string | null
          id?: string
          provider?: string
          unbound_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sensor_bindings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_bindings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_bindings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_baseline: {
        Row: {
          divisions: Json
          event_id: string
          heats: Json
          plans: Json
          slots: Json
          taken_at: string
        }
        Insert: {
          divisions: Json
          event_id: string
          heats: Json
          plans: Json
          slots: Json
          taken_at?: string
        }
        Update: {
          divisions?: Json
          event_id?: string
          heats?: Json
          plans?: Json
          slots?: Json
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_baseline_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_clock: {
        Row: {
          event_id: string
          heat_id: string
          original_sec: number
          speed: number
          started_at: string
        }
        Insert: {
          event_id: string
          heat_id: string
          original_sec: number
          speed: number
          started_at?: string
        }
        Update: {
          event_id?: string
          heat_id?: string
          original_sec?: number
          speed?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_clock_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_clock_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: true
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_control: {
        Row: {
          blocker: string | null
          config: Json
          created_at: string
          event_id: string
          last_tick_at: string | null
          run_no: number
          speed: number
          state: string
          stats: Json
          tick_lock_token: string | null
          tick_lock_until: string | null
          updated_at: string
        }
        Insert: {
          blocker?: string | null
          config?: Json
          created_at?: string
          event_id: string
          last_tick_at?: string | null
          run_no?: number
          speed?: number
          state?: string
          stats?: Json
          tick_lock_token?: string | null
          tick_lock_until?: string | null
          updated_at?: string
        }
        Update: {
          blocker?: string | null
          config?: Json
          created_at?: string
          event_id?: string
          last_tick_at?: string | null
          run_no?: number
          speed?: number
          state?: string
          stats?: Json
          tick_lock_token?: string | null
          tick_lock_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_control_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_log: {
        Row: {
          at: string
          data: Json
          event_id: string
          id: string
          kind: string
          run_no: number
          scenario: string | null
          text: string
        }
        Insert: {
          at?: string
          data?: Json
          event_id: string
          id?: string
          kind: string
          run_no?: number
          scenario?: string | null
          text: string
        }
        Update: {
          at?: string
          data?: Json
          event_id?: string
          id?: string
          kind?: string
          run_no?: number
          scenario?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_seats: {
        Row: {
          created_at: string
          event_id: string
          mode: string
          seat_id: string
          updated_at: string
          view_release_at: string | null
          view_seen_at: string | null
          viewed_by: string | null
          virtual_user: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          mode?: string
          seat_id: string
          updated_at?: string
          view_release_at?: string | null
          view_seen_at?: string | null
          viewed_by?: string | null
          virtual_user?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          mode?: string
          seat_id?: string
          updated_at?: string
          view_release_at?: string | null
          view_seen_at?: string | null
          viewed_by?: string | null
          virtual_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sim_seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_seats_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: true
            referencedRelation: "judge_seats"
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
          height_at?: string | null
          height_m?: number | null
          height_ref?: string | null
          height_source?: string | null
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
          height_at?: string | null
          height_m?: number | null
          height_ref?: string | null
          height_source?: string | null
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
          change_summary: string | null
          content_hash: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          json: Json
          key: string
          organisation_id: string | null
          published_at: string | null
          published_by: string | null
          updated_at: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          content_hash: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          json: Json
          key: string
          organisation_id?: string | null
          published_at?: string | null
          published_by?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          change_summary?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          json?: Json
          key?: string
          organisation_id?: string | null
          published_at?: string | null
          published_by?: string | null
          updated_at?: string
          version?: number
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
      abort_start: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_schedule_plan: { Args: { p_plan: string }; Returns: undefined }
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      add_penalty: {
        Args: {
          p_entry: string
          p_heat: string
          p_reason: string
          p_type: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "penalties"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_add_organiser: {
        Args: { p_org: string; p_role?: string; p_user: string }
        Returns: undefined
      }
      admin_audit_log: {
        Args: { p_limit?: number; p_only_platform?: boolean; p_org?: string }
        Returns: {
          action: string
          actor_email: string
          actor_user_id: string
          after: Json
          at: string
          before: Json
          event_id: string
          event_name: string
          id: string
          organisation_id: string
          organisation_name: string
          reason: string
          table_name: string
        }[]
      }
      admin_create_demo_organisation: { Args: never; Returns: string }
      admin_create_organisation: {
        Args: {
          p_logo_url?: string
          p_name: string
          p_slug: string
          p_timezone: string
        }
        Returns: string
      }
      admin_create_preset_version: {
        Args: {
          p_hash: string
          p_json: Json
          p_key: string
          p_kind: string
          p_name: string
        }
        Returns: string
      }
      admin_delete_organisation: {
        Args: { p_org: string; p_slug_confirm: string }
        Returns: undefined
      }
      admin_health: { Args: never; Returns: Json }
      admin_move_event: {
        Args: { p_event: string; p_target_org: string }
        Returns: Json
      }
      admin_organisation_events: {
        Args: { p_org: string }
        Returns: {
          archived_at: string
          divisions_count: number
          end_date: string
          id: string
          name: string
          published_results: number
          running_heats: number
          slug: string
          start_date: string
          status: string
        }[]
      }
      admin_organisation_members: {
        Args: { p_org: string }
        Returns: {
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      admin_organisation_overview: {
        Args: never
        Returns: {
          archived_at: string
          created_at: string
          events_count: number
          id: string
          last_activity: string
          logo_url: string
          members_count: number
          name: string
          plan: string
          published_events_count: number
          published_results_count: number
          slug: string
          timezone: string
        }[]
      }
      admin_publish_preset: {
        Args: { p_id: string; p_kind: string }
        Returns: undefined
      }
      admin_release_mark_tested: {
        Args: { p_keys: string[]; p_version: string }
        Returns: undefined
      }
      admin_release_status: { Args: never; Returns: Json }
      admin_release_tick: {
        Args: {
          p_key: string
          p_text: string
          p_ticked: boolean
          p_version: string
        }
        Returns: undefined
      }
      admin_remove_organiser: {
        Args: { p_org: string; p_user: string }
        Returns: undefined
      }
      admin_rename_organisation: {
        Args: { p_name: string; p_org: string }
        Returns: undefined
      }
      admin_save_platform_settings: {
        Args: { p_values: Json }
        Returns: undefined
      }
      admin_set_ask_budget: {
        Args: { p_org: string; p_tokens: number }
        Returns: undefined
      }
      admin_set_organisation_archived: {
        Args: { p_archived: boolean; p_org: string }
        Returns: undefined
      }
      admin_set_organisation_logo: {
        Args: { p_logo_url: string; p_org: string }
        Returns: undefined
      }
      admin_set_proposal_status: {
        Args: {
          p_event: string
          p_family: string
          p_key: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      admin_start_impersonation: {
        Args: { p_org: string; p_reason?: string }
        Returns: undefined
      }
      admin_stop_impersonation: { Args: never; Returns: undefined }
      admin_trick_base_history: {
        Args: never
        Returns: {
          change_summary: string
          created_at: string
          created_by_email: string
          id: string
          published_at: string
          published_by_email: string
          version: number
        }[]
      }
      admin_trick_base_publish: {
        Args: { p_id: string; p_summary: string }
        Returns: number
      }
      admin_trick_base_save: {
        Args: { p_base_version: number; p_hash: string; p_json: Json }
        Returns: Json
      }
      admin_trick_proposals: {
        Args: never
        Returns: {
          category: string
          event_id: string
          event_name: string
          family: string
          key: string
          label: string
          organisation_id: string
          organisation_name: string
        }[]
      }
      am_i_head: { Args: { p_event: string }; Returns: boolean }
      approve_seat: {
        Args: { p_actor?: string; p_enc: string; p_pin: string; p_seat: string }
        Returns: Json
      }
      arm_heat: {
        Args: { p_heat: string; p_prestart?: number }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ask_usage: { Args: { p_org: string }; Returns: Json }
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
      cancel_heat: {
        Args: { p_heat: string; p_reason: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_plan_actuals: { Args: { p_plan: string }; Returns: Json }
      clone_event_as_simulation: {
        Args: { p_event: string; p_name?: string }
        Returns: Json
      }
      decide_tie: {
        Args: { p_heat: string; p_reason: string; p_rider_ids: string[] }
        Returns: {
          at: string
          by_seat: string | null
          by_user: string | null
          event_id: string
          heat_id: string
          id: string
          kind: string
          payload: Json
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "heat_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      delete_event: {
        Args: { p_event: string; p_slug_confirm: string }
        Returns: Json
      }
      edit_attempt: {
        Args: {
          p_attempt: string
          p_category?: string
          p_direction?: string
          p_entry?: string
          p_reason: string
          p_status?: string
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      end_heat: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_heat_if_due: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_division_panel: { Args: { p_division: string }; Returns: string }
      extend_prestart: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      flag_out: {
        Args: { p_entries: string[]; p_heat: string; p_reason: string }
        Returns: undefined
      }
      get_live_heat_for_server: { Args: { p_heat: string }; Returns: Json }
      get_public_draw: { Args: { p_event: string }; Returns: Json }
      get_public_event: {
        Args: { p_slug: string }
        Returns: {
          end_date: string
          id: string
          location: string
          name: string
          organisation_logo_url: string
          organisation_name: string
          organisation_slug: string
          slug: string
          start_date: string
          status: string
          timezone: string
        }[]
      }
      get_public_events: {
        Args: { p_limit?: number }
        Returns: {
          end_date: string
          id: string
          location: string
          name: string
          organisation_name: string
          organisation_slug: string
          slug: string
          start_date: string
          status: string
        }[]
      }
      get_public_live_heat: { Args: { p_heat: string }; Returns: Json }
      get_public_organisation: { Args: { p_slug: string }; Returns: Json }
      get_public_results: { Args: { p_event: string }; Returns: Json }
      get_public_rules: { Args: { p_event: string }; Returns: Json }
      get_public_site: { Args: { p_slug: string }; Returns: Json }
      get_public_timetable: { Args: { p_event: string }; Returns: Json }
      get_seat_contacts: {
        Args: { p_event: string }
        Returns: {
          phone: string
          seat_id: string
        }[]
      }
      has_password: { Args: never; Returns: boolean }
      head_set_impression: {
        Args: {
          p_entry: string
          p_heat: string
          p_missed?: boolean
          p_reason: string
          p_seat: string
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
          missed: boolean | null
          updated_at: string
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "impression_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      head_set_trick_score: {
        Args: {
          p_attempt: string
          p_criteria: Json
          p_missed: boolean
          p_reason: string
          p_score: number
          p_seat: string
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
      head_submit_sheet: {
        Args: { p_heat: string; p_reason: string; p_seat: string }
        Returns: {
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          reopened_at: string | null
          reopened_reason: string | null
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "judge_sheets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      import_riders: {
        Args: { p_division: string; p_rows: Json }
        Returns: Json
      }
      lock_division_draw: { Args: { p_division: string }; Returns: undefined }
      merge_attempts: {
        Args: {
          p_choices: Json
          p_drop: string
          p_keep: string
          p_reason: string
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      pause_heat: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_session: { Args: never; Returns: Json }
      practice_add_attempt: {
        Args: {
          p_entry: string
          p_heat: string
          p_status: string
          p_trick: Json
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      public_platform_settings: { Args: never; Returns: Json }
      public_registration_info: { Args: { p_slug: string }; Returns: Json }
      publish_heat_commit: {
        Args: {
          p_actor: string
          p_blockers?: Json
          p_draw: Json
          p_expected_version: number
          p_heat: string
          p_hold: boolean
          p_override_reason: string
          p_projection: Json
          p_results: Json
        }
        Returns: Json
      }
      purge_expired_reset_snapshots: { Args: never; Returns: number }
      purge_organisation: { Args: { p_org: string }; Returns: undefined }
      regenerate_seat_pin: {
        Args: { p_actor?: string; p_enc: string; p_pin: string; p_seat: string }
        Returns: Json
      }
      register_rider: {
        Args: {
          p_consent: boolean
          p_division: string
          p_event_slug: string
          p_fields: Json
          p_identifiers: Json
          p_ip: string
          p_photo_path?: string
        }
        Returns: Json
      }
      remove_penalty: {
        Args: { p_penalty: string; p_reason: string }
        Returns: undefined
      }
      reopen_heat: {
        Args: { p_heat: string; p_reason: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_sheet: {
        Args: { p_heat: string; p_reason: string; p_seat: string }
        Returns: {
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          reopened_at: string | null
          reopened_reason: string | null
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "judge_sheets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_photo_upload: {
        Args: { p_event_slug: string; p_ext: string; p_ip: string }
        Returns: Json
      }
      request_seat: {
        Args: {
          p_event_slug: string
          p_ip: string
          p_name: string
          p_phone?: string
          p_role: string
        }
        Returns: Json
      }
      rerun_heat: {
        Args: {
          p_heat: string
          p_leave_out: Json
          p_name: string
          p_new_heat: string
          p_plan: string
          p_plan_items: Json
          p_plan_updated_at: string
          p_reason: string
          p_suffix: string
        }
        Returns: Json
      }
      reset_division: {
        Args: { p_division: string; p_item: Json; p_reason: string }
        Returns: Json
      }
      reset_division_preview: { Args: { p_division: string }; Returns: Json }
      reset_event: {
        Args: {
          p_draws: Json
          p_event: string
          p_reason: string
          p_slug: string
        }
        Returns: Json
      }
      reset_event_preview: { Args: { p_event: string }; Returns: Json }
      reset_heat: {
        Args: {
          p_before: Json
          p_draw: Json
          p_heat: string
          p_reason: string
          p_seats: Json
        }
        Returns: Json
      }
      reset_heat_preview: { Args: { p_heat: string }; Returns: Json }
      resolve_flag: {
        Args: { p_flag: string; p_resolution?: string }
        Returns: {
          attempt_id: string
          client_key: string
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          kind: string
          note: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attempt_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_event_reset: { Args: { p_snapshot: string }; Returns: Json }
      resume_heat: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_heat: {
        Args: { p_heat: string; p_override_reason?: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
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
      save_division_draw: {
        Args: {
          p_action: string
          p_audit?: Json
          p_division: string
          p_draw: Json
          p_projection: Json
        }
        Returns: undefined
      }
      server_now: { Args: never; Returns: string }
      set_division_panel: {
        Args: { p_division: string; p_seat_ids: string[] }
        Returns: undefined
      }
      set_draw_walkover: {
        Args: { p_division: string; p_draw: Json; p_entry: string }
        Returns: undefined
      }
      set_entry_order: {
        Args: {
          p_division: string
          p_entry_ids: string[]
          p_shuffle_seed?: number
        }
        Returns: undefined
      }
      set_event_archived: {
        Args: { p_archived: boolean; p_event: string }
        Returns: undefined
      }
      set_heat_public_live: {
        Args: { p_heat: string; p_value: boolean }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_plan_anchors: {
        Args: {
          p_anchors: Json
          p_expected?: string
          p_plan: string
          p_reason?: string
        }
        Returns: {
          active: boolean
          actual_starts: Json
          anchors: Json
          created_at: string
          day: string
          defaults: Json
          event_id: string
          hand_pins: Json | null
          hold: Json | null
          id: string
          items: Json
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "schedule_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_plan_hold: {
        Args: {
          p_anchors?: Json
          p_expected?: string
          p_hold: Json
          p_plan: string
          p_reason?: string
        }
        Returns: {
          active: boolean
          actual_starts: Json
          anchors: Json
          created_at: string
          day: string
          defaults: Json
          event_id: string
          hand_pins: Json | null
          hold: Json | null
          id: string
          items: Json
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "schedule_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_publish_hold: {
        Args: { p_heat: string; p_hold: boolean; p_reason?: string }
        Returns: undefined
      }
      set_rider_status: {
        Args: {
          p_entry: string
          p_heat: string
          p_modifier: string
          p_reason: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "heat_slots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_seat_pin: {
        Args: { p_enc?: string; p_pin: string; p_seat: string }
        Returns: undefined
      }
      set_seat_qr: {
        Args: { p_expires: string; p_seat: string; p_token: string }
        Returns: undefined
      }
      set_seat_scores: {
        Args: { p_scores: boolean; p_seat: string }
        Returns: undefined
      }
      set_wind_call: {
        Args: { p_event: string; p_message: string; p_status: string }
        Returns: {
          created_at: string
          event_id: string
          id: string
          message: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "wind_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sim_add_attempt: {
        Args: {
          p_client_key?: string
          p_entry: string
          p_heat: string
          p_override_reason?: string
          p_seat: string
          p_status: string
          p_trick: Json
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      sim_after_reset: { Args: { p_event: string }; Returns: undefined }
      sim_bind_virtual: {
        Args: { p_seat: string; p_user: string }
        Returns: Json
      }
      sim_delete: {
        Args: { p_event: string; p_slug_confirm: string }
        Returns: Json
      }
      sim_enable: { Args: { p_event: string }; Returns: Json }
      sim_live_heat: { Args: { p_heat: string }; Returns: Json }
      sim_log_add: {
        Args: {
          p_data?: Json
          p_event: string
          p_kind: string
          p_scenario: string
          p_text: string
        }
        Returns: undefined
      }
      sim_pause_heats: { Args: { p_event: string }; Returns: number }
      sim_rebuild: {
        Args: { p_event: string; p_slug_confirm: string }
        Returns: Json
      }
      sim_release_stale_views: {
        Args: {
          p_event: string
          p_leave_grace_sec?: number
          p_silent_sec?: number
        }
        Returns: string[]
      }
      sim_resume_heats: { Args: { p_event: string }; Returns: number }
      sim_set: {
        Args: { p_event: string; p_patch: Json }
        Returns: {
          blocker: string | null
          config: Json
          created_at: string
          event_id: string
          last_tick_at: string | null
          run_no: number
          speed: number
          state: string
          stats: Json
          tick_lock_token: string | null
          tick_lock_until: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sim_control"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sim_set_mode: {
        Args: { p_mode: string; p_seat: string }
        Returns: undefined
      }
      sim_stats: { Args: { p_event: string }; Returns: Json }
      sim_submit_impression: {
        Args: {
          p_client_key: string
          p_client_rev: number
          p_entry: string
          p_heat: string
          p_seat: string
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
          missed: boolean | null
          updated_at: string
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "impression_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sim_submit_score: {
        Args: {
          p_attempt: string
          p_client_key: string
          p_client_rev: number
          p_criteria: Json
          p_missed: boolean
          p_score: number
          p_seat: string
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
      sim_submit_sheet: {
        Args: { p_heat: string; p_seat: string }
        Returns: {
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          reopened_at: string | null
          reopened_reason: string | null
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "judge_sheets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sim_tick_begin: {
        Args: { p_event: string; p_ms?: number }
        Returns: string
      }
      sim_tick_end: {
        Args: { p_event: string; p_token: string }
        Returns: boolean
      }
      sim_tick_lock: {
        Args: { p_event: string; p_ms?: number }
        Returns: boolean
      }
      sim_view_as: { Args: { p_event: string; p_seat: string }; Returns: Json }
      sim_view_beat: { Args: { p_event: string }; Returns: boolean }
      sim_view_leave: { Args: { p_event: string }; Returns: boolean }
      start_armed_if_due: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_heat: {
        Args: { p_heat: string }
        Returns: {
          armed_at: string | null
          armed_paused_at: string | null
          created_at: string
          division_id: string
          draw_uid: string | null
          duration_sec: number
          ended_at: string | null
          event_id: string
          flag_out: Json | null
          id: string
          live_rev: number
          manual_override: boolean
          name: string | null
          number: number
          number_suffix: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_total_sec: number
          prestart_sec: number | null
          public_live: boolean | null
          publish_hold: boolean
          published_at: string | null
          reopened_at: string | null
          rerun_of: string | null
          round_id: string
          started_at: string | null
          status: string
          time_scale: number
          updated_at: string
          warm_up_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "heats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_flag: {
        Args: {
          p_attempt: string
          p_client_key: string
          p_kind: string
          p_note: string
        }
        Returns: {
          attempt_id: string
          client_key: string
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          kind: string
          note: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attempt_flags"
          isOneToOne: true
          isSetofReturn: false
        }
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
          missed: boolean | null
          updated_at: string
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "impression_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_sheet: {
        Args: { p_heat: string }
        Returns: {
          created_at: string
          event_id: string
          heat_id: string
          id: string
          judge_seat_id: string
          reopened_at: string | null
          reopened_reason: string | null
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "judge_sheets"
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
      touch_seat: { Args: never; Returns: undefined }
      undo_attempt: {
        Args: { p_attempt: string }
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
          height_at: string | null
          height_m: number | null
          height_ref: string | null
          height_source: string | null
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
      unlock_division_draw: {
        Args: { p_division: string; p_reason: string }
        Returns: undefined
      }
      unlock_division_rules: {
        Args: { p_division: string; p_reason: string }
        Returns: undefined
      }
      update_event_trick_base: { Args: { p_event: string }; Returns: Json }
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

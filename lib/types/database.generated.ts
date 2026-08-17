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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      blind_mappings: {
        Row: {
          blind_sample_id: string
          created_at: string
          product_id: string
          project_id: string
          protocol_id: string
        }
        Insert: {
          blind_sample_id: string
          created_at?: string
          product_id: string
          project_id: string
          protocol_id: string
        }
        Update: {
          blind_sample_id?: string
          created_at?: string
          product_id?: string
          project_id?: string
          protocol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blind_mappings_blind_sample_id_protocol_id_fkey"
            columns: ["blind_sample_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "blind_samples"
            referencedColumns: ["id", "protocol_id"]
          },
          {
            foreignKeyName: "blind_mappings_project_id_product_id_fkey"
            columns: ["project_id", "product_id"]
            isOneToOne: false
            referencedRelation: "project_products"
            referencedColumns: ["project_id", "product_id"]
          },
          {
            foreignKeyName: "blind_mappings_protocol_id_project_id_fkey"
            columns: ["protocol_id", "project_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      blind_samples: {
        Row: {
          created_at: string
          id: string
          label: string
          protocol_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          protocol_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          protocol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blind_samples_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      human_review_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          event_sequence: number
          id: string
          judge_score_id: string
          override_score: number | null
          reason: string | null
          review_session_id: string
          score_revision: number
          target_event_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          judge_score_id: string
          override_score?: number | null
          reason?: string | null
          review_session_id: string
          score_revision?: number
          target_event_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          judge_score_id?: string
          override_score?: number | null
          reason?: string | null
          review_session_id?: string
          score_revision?: number
          target_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "human_review_events_judge_score_id_fkey"
            columns: ["judge_score_id"]
            isOneToOne: false
            referencedRelation: "judge_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_review_events_judge_score_id_fkey"
            columns: ["judge_score_id"]
            isOneToOne: false
            referencedRelation: "review_final_scores"
            referencedColumns: ["judge_score_id"]
          },
          {
            foreignKeyName: "human_review_events_review_session_id_fkey"
            columns: ["review_session_id"]
            isOneToOne: false
            referencedRelation: "review_final_scores"
            referencedColumns: ["review_session_id"]
          },
          {
            foreignKeyName: "human_review_events_review_session_id_fkey"
            columns: ["review_session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_review_events_target_event_id_fkey"
            columns: ["target_event_id"]
            isOneToOne: false
            referencedRelation: "human_review_events"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_case_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_signature: string
          input_tokens: number | null
          judge_run_id: string
          latency_ms: number | null
          model: string
          output_tokens: number | null
          prompt_version: string
          protocol_id: string
          provider: string
          started_at: string | null
          status: string
          test_case_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_signature: string
          input_tokens?: number | null
          judge_run_id: string
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          prompt_version: string
          protocol_id: string
          provider: string
          started_at?: string | null
          status?: string
          test_case_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_signature?: string
          input_tokens?: number | null
          judge_run_id?: string
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string
          protocol_id?: string
          provider?: string
          started_at?: string | null
          status?: string
          test_case_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_case_runs_judge_run_id_protocol_id_fkey"
            columns: ["judge_run_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "judge_runs"
            referencedColumns: ["id", "protocol_id"]
          },
          {
            foreignKeyName: "judge_case_runs_test_case_id_protocol_id_fkey"
            columns: ["test_case_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id", "protocol_id"]
          },
        ]
      }
      judge_run_artifacts: {
        Row: {
          artifact_id: string
          created_at: string
          judge_run_id: string
        }
        Insert: {
          artifact_id: string
          created_at?: string
          judge_run_id: string
        }
        Update: {
          artifact_id?: string
          created_at?: string
          judge_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_run_artifacts_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "test_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_run_artifacts_judge_run_id_fkey"
            columns: ["judge_run_id"]
            isOneToOne: false
            referencedRelation: "judge_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_runs: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input_signature: string
          input_snapshot: Json
          model: string
          project_id: string
          prompt_version: string
          protocol_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_signature: string
          input_snapshot: Json
          model: string
          project_id: string
          prompt_version: string
          protocol_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_signature?: string
          input_snapshot?: Json
          model?: string
          project_id?: string
          prompt_version?: string
          protocol_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_runs_protocol_id_project_id_fkey"
            columns: ["protocol_id", "project_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      judge_scores: {
        Row: {
          ai_score: number
          blind_sample_id: string
          confidence: number
          created_at: string
          evidence: Json
          id: string
          judge_case_run_id: string
          judge_run_id: string
          model: string
          prompt_version: string
          protocol_id: string
          reason: string
          rubric_dimension_id: string
          test_case_id: string
        }
        Insert: {
          ai_score: number
          blind_sample_id: string
          confidence: number
          created_at?: string
          evidence?: Json
          id?: string
          judge_case_run_id: string
          judge_run_id: string
          model: string
          prompt_version: string
          protocol_id: string
          reason: string
          rubric_dimension_id: string
          test_case_id: string
        }
        Update: {
          ai_score?: number
          blind_sample_id?: string
          confidence?: number
          created_at?: string
          evidence?: Json
          id?: string
          judge_case_run_id?: string
          judge_run_id?: string
          model?: string
          prompt_version?: string
          protocol_id?: string
          reason?: string
          rubric_dimension_id?: string
          test_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_scores_blind_sample_id_protocol_id_fkey"
            columns: ["blind_sample_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "blind_samples"
            referencedColumns: ["id", "protocol_id"]
          },
          {
            foreignKeyName: "judge_scores_judge_case_run_id_judge_run_id_test_case_id_fkey"
            columns: ["judge_case_run_id", "judge_run_id", "test_case_id"]
            isOneToOne: false
            referencedRelation: "judge_case_runs"
            referencedColumns: ["id", "judge_run_id", "test_case_id"]
          },
          {
            foreignKeyName: "judge_scores_judge_run_id_protocol_id_fkey"
            columns: ["judge_run_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "judge_runs"
            referencedColumns: ["id", "protocol_id"]
          },
          {
            foreignKeyName: "judge_scores_rubric_dimension_id_protocol_id_fkey"
            columns: ["rubric_dimension_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "rubric_dimensions"
            referencedColumns: ["id", "protocol_id"]
          },
          {
            foreignKeyName: "judge_scores_test_case_id_protocol_id_fkey"
            columns: ["test_case_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id", "protocol_id"]
          },
        ]
      }
      product_research: {
        Row: {
          capabilities: Json
          created_at: string
          id: string
          key_features: Json
          limitations: Json
          official_best_practices: Json
          positioning: string
          pricing: Json | null
          product_id: string
          project_id: string
          research_run_id: string
          sources: Json
          target_users: Json
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          id?: string
          key_features?: Json
          limitations?: Json
          official_best_practices?: Json
          positioning: string
          pricing?: Json | null
          product_id: string
          project_id: string
          research_run_id: string
          sources?: Json
          target_users?: Json
        }
        Update: {
          capabilities?: Json
          created_at?: string
          id?: string
          key_features?: Json
          limitations?: Json
          official_best_practices?: Json
          positioning?: string
          pricing?: Json | null
          product_id?: string
          project_id?: string
          research_run_id?: string
          sources?: Json
          target_users?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_research_project_id_product_id_fkey"
            columns: ["project_id", "product_id"]
            isOneToOne: false
            referencedRelation: "project_products"
            referencedColumns: ["project_id", "product_id"]
          },
          {
            foreignKeyName: "product_research_research_run_id_project_id_fkey"
            columns: ["research_run_id", "project_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          normalized_name: string
          official_url: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          normalized_name: string
          official_url?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          normalized_name?: string
          official_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_products: {
        Row: {
          created_at: string
          display_order: number
          product_id: string
          project_id: string
          submitted_name: string
          submitted_official_url: string | null
        }
        Insert: {
          created_at?: string
          display_order: number
          product_id: string
          project_id: string
          submitted_name: string
          submitted_official_url?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          product_id?: string
          project_id?: string
          submitted_name?: string
          submitted_official_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          intent: string
          name: string
          owner_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          intent: string
          name: string
          owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          intent?: string
          name?: string
          owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      protocols: {
        Row: {
          created_at: string
          generation_estimated_cost: number | null
          generation_input_tokens: number | null
          generation_latency_ms: number | null
          generation_model: string | null
          generation_output_tokens: number | null
          generation_provider: string | null
          goal: string
          id: string
          input_signature: string | null
          locked_at: string | null
          project_id: string
          prompt_version: string | null
          research_run_id: string
          rules: Json
          status: string
          test_mode: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          generation_estimated_cost?: number | null
          generation_input_tokens?: number | null
          generation_latency_ms?: number | null
          generation_model?: string | null
          generation_output_tokens?: number | null
          generation_provider?: string | null
          goal: string
          id?: string
          input_signature?: string | null
          locked_at?: string | null
          project_id: string
          prompt_version?: string | null
          research_run_id: string
          rules?: Json
          status?: string
          test_mode?: string
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          generation_estimated_cost?: number | null
          generation_input_tokens?: number | null
          generation_latency_ms?: number | null
          generation_model?: string | null
          generation_output_tokens?: number | null
          generation_provider?: string | null
          goal?: string
          id?: string
          input_signature?: string | null
          locked_at?: string | null
          project_id?: string
          prompt_version?: string | null
          research_run_id?: string
          rules?: Json
          status?: string
          test_mode?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "protocols_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocols_research_run_id_project_id_fkey"
            columns: ["research_run_id", "project_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      publish_pack_artifacts: {
        Row: {
          artifact_id: string
          created_at: string
          display_order: number
          publish_pack_id: string
          reason: string
          supports_claim: string | null
          supports_paragraph: number | null
        }
        Insert: {
          artifact_id: string
          created_at?: string
          display_order: number
          publish_pack_id: string
          reason: string
          supports_claim?: string | null
          supports_paragraph?: number | null
        }
        Update: {
          artifact_id?: string
          created_at?: string
          display_order?: number
          publish_pack_id?: string
          reason?: string
          supports_claim?: string | null
          supports_paragraph?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_pack_artifacts_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "test_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_pack_artifacts_publish_pack_id_fkey"
            columns: ["publish_pack_id"]
            isOneToOne: false
            referencedRelation: "publish_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_packs: {
        Row: {
          community_post: Json | null
          completed_at: string | null
          config: Json
          content_ideas: Json
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_signature: string | null
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          project_id: string
          prompt_version: string | null
          provider: string | null
          report_id: string
          selected_idea: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          community_post?: Json | null
          completed_at?: string | null
          config?: Json
          content_ideas?: Json
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_signature?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id: string
          prompt_version?: string | null
          provider?: string | null
          report_id: string
          selected_idea?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          community_post?: Json | null
          completed_at?: string | null
          config?: Json
          content_ideas?: Json
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_signature?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id?: string
          prompt_version?: string | null
          provider?: string | null
          report_id?: string
          selected_idea?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "publish_packs_report_id_project_id_fkey"
            columns: ["report_id", "project_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      report_artifacts: {
        Row: {
          artifact_id: string
          caption: string | null
          created_at: string
          evidence_role: string
          report_id: string
        }
        Insert: {
          artifact_id: string
          caption?: string | null
          created_at?: string
          evidence_role?: string
          report_id: string
        }
        Update: {
          artifact_id?: string
          caption?: string | null
          created_at?: string
          evidence_role?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_artifacts_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "test_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_artifacts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          completed_at: string | null
          content: Json | null
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          project_id: string
          prompt_version: string | null
          provider: string | null
          result_analysis_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          content?: Json | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id: string
          prompt_version?: string | null
          provider?: string | null
          result_analysis_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          content?: Json | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id?: string
          prompt_version?: string | null
          provider?: string | null
          result_analysis_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_result_analysis_id_project_id_fkey"
            columns: ["result_analysis_id", "project_id"]
            isOneToOne: false
            referencedRelation: "result_analyses"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      research_runs: {
        Row: {
          comparability: Json | null
          comparability_estimated_cost: number | null
          comparability_input_tokens: number | null
          comparability_latency_ms: number | null
          comparability_model: string | null
          comparability_output_tokens: number | null
          comparability_prompt_version: string | null
          comparability_provider: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_signature: string | null
          input_snapshot: Json
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          project_id: string
          prompt_version: string | null
          provider: string | null
          search_model: string | null
          search_prompt_version: string | null
          search_provider: string | null
          started_at: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          comparability?: Json | null
          comparability_estimated_cost?: number | null
          comparability_input_tokens?: number | null
          comparability_latency_ms?: number | null
          comparability_model?: string | null
          comparability_output_tokens?: number | null
          comparability_prompt_version?: string | null
          comparability_provider?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_signature?: string | null
          input_snapshot?: Json
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id: string
          prompt_version?: string | null
          provider?: string | null
          search_model?: string | null
          search_prompt_version?: string | null
          search_provider?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          comparability?: Json | null
          comparability_estimated_cost?: number | null
          comparability_input_tokens?: number | null
          comparability_latency_ms?: number | null
          comparability_model?: string | null
          comparability_output_tokens?: number | null
          comparability_prompt_version?: string | null
          comparability_provider?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_signature?: string | null
          input_snapshot?: Json
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id?: string
          prompt_version?: string | null
          provider?: string | null
          search_model?: string | null
          search_prompt_version?: string | null
          search_provider?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      result_analyses: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          final_score_signature: string
          id: string
          input_snapshot: Json
          input_tokens: number | null
          judge_run_id: string
          latency_ms: number | null
          model: string | null
          output: Json | null
          output_tokens: number | null
          project_id: string
          prompt_version: string | null
          protocol_id: string
          provider: string | null
          review_session_id: string
          started_at: string | null
          status: string
          updated_at: string
          winner_product_id: string | null
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          final_score_signature: string
          id?: string
          input_snapshot?: Json
          input_tokens?: number | null
          judge_run_id: string
          latency_ms?: number | null
          model?: string | null
          output?: Json | null
          output_tokens?: number | null
          project_id: string
          prompt_version?: string | null
          protocol_id: string
          provider?: string | null
          review_session_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_product_id?: string | null
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          final_score_signature?: string
          id?: string
          input_snapshot?: Json
          input_tokens?: number | null
          judge_run_id?: string
          latency_ms?: number | null
          model?: string | null
          output?: Json | null
          output_tokens?: number | null
          project_id?: string
          prompt_version?: string | null
          protocol_id?: string
          provider?: string | null
          review_session_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "result_analyses_project_id_winner_product_id_fkey"
            columns: ["project_id", "winner_product_id"]
            isOneToOne: false
            referencedRelation: "project_products"
            referencedColumns: ["project_id", "product_id"]
          },
          {
            foreignKeyName: "result_analyses_review_session_id_project_id_protocol_id_j_fkey"
            columns: [
              "review_session_id",
              "project_id",
              "protocol_id",
              "judge_run_id",
            ]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: [
              "id",
              "project_id",
              "protocol_id",
              "judge_run_id",
            ]
          },
        ]
      }
      review_sessions: {
        Row: {
          created_at: string
          id: string
          judge_run_id: string
          locked_at: string | null
          project_id: string
          protocol_id: string
          revealed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          judge_run_id: string
          locked_at?: string | null
          project_id: string
          protocol_id: string
          revealed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          judge_run_id?: string
          locked_at?: string | null
          project_id?: string
          protocol_id?: string
          revealed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_judge_run_id_protocol_id_fkey"
            columns: ["judge_run_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "judge_runs"
            referencedColumns: ["id", "protocol_id"]
          },
          {
            foreignKeyName: "review_sessions_protocol_id_project_id_fkey"
            columns: ["protocol_id", "project_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      rubric_dimensions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          protocol_id: string
          scoring_standard: Json
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position: number
          protocol_id: string
          scoring_standard?: Json
          updated_at?: string
          weight: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          protocol_id?: string
          scoring_standard?: Json
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_dimensions_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      test_artifacts: {
        Row: {
          bucket_id: string
          created_at: string
          file_name: string
          id: string
          kind: string
          metadata: Json
          mime_type: string
          preview_path: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          test_run_id: string
        }
        Insert: {
          bucket_id?: string
          created_at?: string
          file_name: string
          id?: string
          kind: string
          metadata?: Json
          mime_type: string
          preview_path?: string | null
          sha256?: string | null
          size_bytes: number
          storage_path: string
          test_run_id: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string
          preview_path?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          test_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_artifacts_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_cases: {
        Row: {
          created_at: string
          execution_rules: Json
          id: string
          input_artifacts: Json
          input_description: string | null
          objective: string
          observation_focus: Json
          position: number
          prompt: string
          protocol_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          execution_rules?: Json
          id?: string
          input_artifacts?: Json
          input_description?: string | null
          objective: string
          observation_focus?: Json
          position: number
          prompt: string
          protocol_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          execution_rules?: Json
          id?: string
          input_artifacts?: Json
          input_description?: string | null
          objective?: string
          observation_focus?: Json
          position?: number
          prompt?: string
          protocol_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_cases_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          created_at: string
          generation_time_seconds: number | null
          id: string
          manually_edited: boolean
          notes: string | null
          product_id: string
          project_id: string
          protocol_id: string
          retry_count: number
          status: string
          test_case_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generation_time_seconds?: number | null
          id?: string
          manually_edited?: boolean
          notes?: string | null
          product_id: string
          project_id: string
          protocol_id: string
          retry_count?: number
          status?: string
          test_case_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generation_time_seconds?: number | null
          id?: string
          manually_edited?: boolean
          notes?: string | null
          product_id?: string
          project_id?: string
          protocol_id?: string
          retry_count?: number
          status?: string
          test_case_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_project_id_product_id_fkey"
            columns: ["project_id", "product_id"]
            isOneToOne: false
            referencedRelation: "project_products"
            referencedColumns: ["project_id", "product_id"]
          },
          {
            foreignKeyName: "test_runs_protocol_id_project_id_fkey"
            columns: ["protocol_id", "project_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "test_runs_test_case_id_protocol_id_fkey"
            columns: ["test_case_id", "protocol_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id", "protocol_id"]
          },
        ]
      }
    }
    Views: {
      review_final_scores: {
        Row: {
          active_override_event_id: string | null
          ai_score: number | null
          blind_sample_id: string | null
          final_score: number | null
          judge_score_id: string | null
          review_session_id: string | null
          rubric_dimension_id: string | null
          test_case_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      append_human_override: {
        Args: {
          p_judge_score_id: string
          p_override_score: number
          p_project_id: string
          p_reason: string
          p_review_session_id: string
        }
        Returns: string
      }
      append_human_revert: {
        Args: {
          p_judge_score_id: string
          p_project_id: string
          p_review_session_id: string
        }
        Returns: string
      }
      assert_blind_protocol_safe: {
        Args: { p_project_id: string; p_protocol_id: string }
        Returns: undefined
      }
      begin_judge_case_run: {
        Args: {
          p_input_signature: string
          p_judge_run_id: string
          p_model: string
          p_prompt_version: string
          p_provider: string
          p_test_case_id: string
        }
        Returns: string
      }
      begin_judge_run: {
        Args: { p_project_id: string; p_protocol_id: string }
        Returns: string
      }
      begin_product_research: {
        Args: {
          p_input_signature: string
          p_input_snapshot: Json
          p_project_id: string
        }
        Returns: string
      }
      begin_result_analysis: {
        Args: { p_project_id: string; p_review_session_id: string }
        Returns: string
      }
      complete_judge_case_run: {
        Args: { p_judge_case_run_id: string; p_scores: Json; p_usage: Json }
        Returns: undefined
      }
      complete_judge_run: {
        Args: { p_judge_run_id: string }
        Returns: undefined
      }
      complete_product_research: {
        Args: {
          p_comparability: Json
          p_comparability_model: string
          p_comparability_prompt_version: string
          p_comparability_provider: string
          p_comparability_usage: Json
          p_research_run_id: string
          p_search_model: string
          p_search_prompt_version: string
          p_search_provider: string
          p_synthesis_model: string
          p_synthesis_prompt_version: string
          p_synthesis_provider: string
          p_synthesis_usage: Json
        }
        Returns: undefined
      }
      complete_result_analysis: {
        Args: {
          p_output: Json
          p_result_analysis_id: string
          p_usage: Json
          p_winner_product_id: string
        }
        Returns: undefined
      }
      create_benchmark_project: {
        Args: {
          p_intent: string
          p_name: string
          p_owner_id?: string
          p_products: Json
        }
        Returns: string
      }
      create_protocol_draft: {
        Args: {
          p_generation_model: string
          p_generation_provider: string
          p_input_signature: string
          p_project_id: string
          p_prompt_version: string
          p_protocol: Json
          p_research_run_id: string
          p_usage: Json
        }
        Returns: string
      }
      ensure_review_session: {
        Args: { p_project_id: string; p_protocol_id: string }
        Returns: string
      }
      ensure_test_run_matrix: {
        Args: { p_project_id: string; p_protocol_id: string }
        Returns: undefined
      }
      fail_judge_run: {
        Args: { p_error_message: string; p_judge_run_id: string }
        Returns: undefined
      }
      fail_product_research: {
        Args: { p_error_message: string; p_research_run_id: string }
        Returns: undefined
      }
      fail_result_analysis: {
        Args: { p_error_message: string; p_result_analysis_id: string }
        Returns: undefined
      }
      finalize_test_execution: {
        Args: { p_project_id: string; p_protocol_id: string }
        Returns: undefined
      }
      get_judge_case_inputs: {
        Args: { p_judge_run_id: string; p_test_case_id: string }
        Returns: {
          artifact_id: string
          artifact_kind: string
          blind_sample_id: string
          file_name: string
          mime_type: string
          sample_label: string
          sha256: string
          size_bytes: number
          storage_path: string
        }[]
      }
      get_revealed_review_mapping: {
        Args: { p_review_session_id: string }
        Returns: {
          blind_sample_id: string
          product_id: string
          product_logo_url: string
          product_name: string
          sample_label: string
        }[]
      }
      initialize_blind_layer: {
        Args: { p_project_id: string; p_protocol_id: string }
        Returns: undefined
      }
      lock_protocol: { Args: { p_protocol_id: string }; Returns: undefined }
      lock_review_session: {
        Args: { p_project_id: string; p_review_session_id: string }
        Returns: undefined
      }
      record_test_artifact: {
        Args: { p_artifact: Json; p_run_metadata: Json; p_test_run_id: string }
        Returns: string
      }
      reveal_review_session: {
        Args: { p_project_id: string; p_review_session_id: string }
        Returns: undefined
      }
      start_result_analysis: {
        Args: {
          p_model: string
          p_prompt_version: string
          p_provider: string
          p_result_analysis_id: string
        }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

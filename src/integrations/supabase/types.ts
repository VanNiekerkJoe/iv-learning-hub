export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      access_logs: {
        Row: {
          content_id: string | null;
          created_at: string;
          event: string;
          id: string;
          ip: string;
          student_id: string;
          user_agent: string;
        };
        Insert: {
          content_id?: string | null;
          created_at?: string;
          event?: string;
          id?: string;
          ip?: string;
          student_id: string;
          user_agent?: string;
        };
        Update: {
          content_id?: string | null;
          created_at?: string;
          event?: string;
          id?: string;
          ip?: string;
          student_id?: string;
          user_agent?: string;
        };
        Relationships: [
          {
            foreignKeyName: "access_logs_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "access_logs_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_folders: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          module_id: string;
          parent_folder_id: string | null;
          position: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          module_id: string;
          parent_folder_id?: string | null;
          position?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          module_id?: string;
          parent_folder_id?: string | null;
          position?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_folders_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_folders_parent_folder_id_fkey";
            columns: ["parent_folder_id"];
            isOneToOne: false;
            referencedRelation: "content_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      content_items: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string;
          folder_id: string | null;
          id: string;
          is_hidden: boolean;
          module_id: string;
          position: number;
          storage_path: string;
          title: string;
          type: Database["public"]["Enums"]["content_kind"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          folder_id?: string | null;
          id?: string;
          is_hidden?: boolean;
          module_id: string;
          position?: number;
          storage_path: string;
          title: string;
          type: Database["public"]["Enums"]["content_kind"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          folder_id?: string | null;
          id?: string;
          is_hidden?: boolean;
          module_id?: string;
          position?: number;
          storage_path?: string;
          title?: string;
          type?: Database["public"]["Enums"]["content_kind"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_items_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_items_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "content_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          position: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          position?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          position?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          student_id: string;
          terms_accepted_at: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          full_name?: string;
          id: string;
          role?: Database["public"]["Enums"]["app_role"];
          student_id: string;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          full_name?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          student_id?: string;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      progress: {
        Row: {
          content_id: string;
          position_seconds: number;
          status: Database["public"]["Enums"]["learning_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          content_id: string;
          position_seconds?: number;
          status?: Database["public"]["Enums"]["learning_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          content_id?: string;
          position_seconds?: number;
          status?: Database["public"]["Enums"]["learning_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progress_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progress_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      student_modules: {
        Row: {
          assigned_at: string;
          module_id: string;
          student_id: string;
        };
        Insert: {
          assigned_at?: string;
          module_id: string;
          student_id: string;
        };
        Update: {
          assigned_at?: string;
          module_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_modules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_modules_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      student_registrations: {
        Row: {
          cell_phone: string;
          created_at: string;
          declaration_accepted: boolean;
          education_document_name: string;
          education_document_path: string;
          email: string;
          employed_at_real_estate_company: boolean;
          ethnicity: string;
          full_home_address: string;
          full_names: string;
          gender: string;
          home_language: string;
          id: string;
          id_document_name: string;
          id_document_path: string;
          passed_grade_12: boolean;
          passport_country: string | null;
          passport_number: string | null;
          payment_proof_name: string;
          payment_proof_path: string;
          payment_plan: Database["public"]["Enums"]["registration_payment_plan"];
          postal_code: string;
          province: string;
          qualification_name: string;
          real_estate_company: string;
          review_notes: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          signature_date: string;
          signature_name: string;
          south_african_id_number: string | null;
          status: Database["public"]["Enums"]["registration_status"];
          student_profile_id: string | null;
          submission_token_hash: string;
          surname: string;
          updated_at: string;
        };
        Insert: {
          cell_phone: string;
          created_at?: string;
          declaration_accepted: boolean;
          education_document_name: string;
          education_document_path: string;
          email: string;
          employed_at_real_estate_company: boolean;
          ethnicity: string;
          full_home_address: string;
          full_names: string;
          gender: string;
          home_language: string;
          id?: string;
          id_document_name: string;
          id_document_path: string;
          passed_grade_12: boolean;
          passport_country?: string | null;
          passport_number?: string | null;
          payment_proof_name: string;
          payment_proof_path: string;
          payment_plan: Database["public"]["Enums"]["registration_payment_plan"];
          postal_code: string;
          province: string;
          qualification_name: string;
          real_estate_company?: string;
          review_notes?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          signature_date: string;
          signature_name: string;
          south_african_id_number?: string | null;
          status?: Database["public"]["Enums"]["registration_status"];
          student_profile_id?: string | null;
          submission_token_hash: string;
          surname: string;
          updated_at?: string;
        };
        Update: {
          cell_phone?: string;
          created_at?: string;
          declaration_accepted?: boolean;
          education_document_name?: string;
          education_document_path?: string;
          email?: string;
          employed_at_real_estate_company?: boolean;
          ethnicity?: string;
          full_home_address?: string;
          full_names?: string;
          gender?: string;
          home_language?: string;
          id?: string;
          id_document_name?: string;
          id_document_path?: string;
          passed_grade_12?: boolean;
          passport_country?: string | null;
          passport_number?: string | null;
          payment_proof_name?: string;
          payment_proof_path?: string;
          payment_plan?: Database["public"]["Enums"]["registration_payment_plan"];
          postal_code?: string;
          province?: string;
          qualification_name?: string;
          real_estate_company?: string;
          review_notes?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          signature_date?: string;
          signature_name?: string;
          south_african_id_number?: string | null;
          status?: Database["public"]["Enums"]["registration_status"];
          student_profile_id?: string | null;
          submission_token_hash?: string;
          surname?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_registrations_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_registrations_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "student";
      content_kind: "pdf" | "video" | "audio";
      learning_status: "not_started" | "in_progress" | "completed";
      registration_payment_plan: "once_off" | "monthly";
      registration_status: "draft" | "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "student"],
      content_kind: ["pdf", "video", "audio"],
      learning_status: ["not_started", "in_progress", "completed"],
      registration_payment_plan: ["once_off", "monthly"],
      registration_status: ["draft", "pending", "approved", "rejected"],
    },
  },
} as const;

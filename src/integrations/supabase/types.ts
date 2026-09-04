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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_secrets: {
        Row: {
          login_id: string | null
          password: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          login_id?: string | null
          password?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          login_id?: string | null
          password?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: string | null
          entity: string | null
          id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: string | null
          entity?: string | null
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: string | null
          entity?: string | null
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          file_name: string | null
          file_url: string | null
          id: string
          message: string
          site_id: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          message: string
          site_id?: string | null
          starts_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          message?: string
          site_id?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          address: string | null
          company_id: string | null
          company_name: string
          currency: string
          entry_prefix: string
          footer_note: string | null
          id: number
          invoice_prefix: string
          phone: string | null
          transfer_prefix: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          company_name?: string
          currency?: string
          entry_prefix?: string
          footer_note?: string | null
          id?: number
          invoice_prefix?: string
          phone?: string | null
          transfer_prefix?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          company_name?: string
          currency?: string
          entry_prefix?: string
          footer_note?: string | null
          id?: number
          invoice_prefix?: string
          phone?: string | null
          transfer_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          max_sites: number
          name: string
          phone: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_sites?: number
          name: string
          phone?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_sites?: number
          name?: string
          phone?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          currency: string
          due_date: string
          id: string
          label: string | null
          paid_at: string | null
          payment_method: string | null
          payment_ref: string | null
          period: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          label?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          period: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          label?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          period?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          message: string
          resolution_note: string | null
          resolved_by: string | null
          status: string
          target_id: string | null
          target_kind: string
          target_label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          message: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string
          target_label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          message?: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string
          target_label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          company_id: string | null
          created_at: string
          id: string
          label: string | null
          site_id: string | null
          spent_on: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          category: string
          company_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          site_id?: string | null
          spent_on?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          site_id?: string | null
          spent_on?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_name: string | null
          company_id: string | null
          created_at: string
          id: string
          kind: string
          movement_id: string | null
          number: string
          sale_id: string | null
          site_id: string | null
          transfer_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          kind: string
          movement_id?: string | null
          number: string
          sale_id?: string | null
          site_id?: string | null
          transfer_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          movement_id?: string | null
          number?: string
          sale_id?: string | null
          site_id?: string | null
          transfer_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      losses: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          description: string | null
          employee_id: string | null
          id: string
          kind: string
          period: string
          product_id: string | null
          quantity_units: number
          site_id: string | null
        }
        Insert: {
          amount?: number
          company_id?: string | null
          created_at?: string
          description?: string | null
          employee_id?: string | null
          id?: string
          kind?: string
          period?: string
          product_id?: string | null
          quantity_units?: number
          site_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          description?: string | null
          employee_id?: string | null
          id?: string
          kind?: string
          period?: string
          product_id?: string | null
          quantity_units?: number
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "losses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "losses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "losses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          kind: string
          mode: string
          product_id: string
          quantity: number
          quantity_units: number
          reason: string | null
          reference: string | null
          site_id: string | null
          unit_price: number
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          kind: string
          mode?: string
          product_id: string
          quantity: number
          quantity_units: number
          reason?: string | null
          reference?: string | null
          site_id?: string | null
          unit_price?: number
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          mode?: string
          product_id?: string
          quantity?: number
          quantity_units?: number
          reason?: string | null
          reference?: string | null
          site_id?: string | null
          unit_price?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stocks: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          min_stock_units: number
          product_id: string
          site_id: string
          stock_units: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          min_stock_units?: number
          product_id: string
          site_id: string
          stock_units?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          min_stock_units?: number
          product_id?: string
          site_id?: string
          stock_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stocks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stocks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          company_id: string | null
          cost_price: number
          created_at: string
          id: string
          min_stock_units: number
          name: string
          retail_price: number
          retail_unit: string
          sale_mode: string
          sku: string | null
          stock_units: number
          units_per_package: number
          updated_at: string
          wholesale_price: number
          wholesale_unit: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          min_stock_units?: number
          name: string
          retail_price?: number
          retail_unit?: string
          sale_mode?: string
          sku?: string | null
          stock_units?: number
          units_per_package?: number
          updated_at?: string
          wholesale_price?: number
          wholesale_unit?: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          min_stock_units?: number
          name?: string
          retail_price?: number
          retail_unit?: string
          sale_mode?: string
          sku?: string | null
          stock_units?: number
          units_per_package?: number
          updated_at?: string
          wholesale_price?: number
          wholesale_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          base_salary: number
          company_id: string | null
          created_at: string
          default_site_id: string | null
          email: string | null
          full_name: string
          id: string
          login_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          company_id?: string | null
          created_at?: string
          default_site_id?: string | null
          email?: string | null
          full_name?: string
          id: string
          login_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          company_id?: string | null
          created_at?: string
          default_site_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          login_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_site_id_fkey"
            columns: ["default_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries: {
        Row: {
          base_salary: number
          bonus: number
          company_id: string | null
          created_at: string
          employee_id: string
          id: string
          losses_deduction: number
          other_deduction: number
          paid: boolean
          period: string
          savings_transfer: number
          updated_at: string
        }
        Insert: {
          base_salary?: number
          bonus?: number
          company_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          losses_deduction?: number
          other_deduction?: number
          paid?: boolean
          period: string
          savings_transfer?: number
          updated_at?: string
        }
        Update: {
          base_salary?: number
          bonus?: number
          company_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          losses_deduction?: number
          other_deduction?: number
          paid?: boolean
          period?: string
          savings_transfer?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salaries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          line_total: number
          mode: string
          product_id: string | null
          product_name: string
          quantity: number
          quantity_units: number
          sale_id: string
          unit_label: string
          unit_price: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          line_total?: number
          mode?: string
          product_id?: string | null
          product_name: string
          quantity: number
          quantity_units: number
          sale_id: string
          unit_label?: string
          unit_price?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          line_total?: number
          mode?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          quantity_units?: number
          sale_id?: string
          unit_label?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_name: string | null
          company_id: string | null
          created_at: string
          id: string
          invoice_number: string
          note: string | null
          paid: number
          site_id: string | null
          total: number
          user_id: string | null
        }
        Insert: {
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          invoice_number: string
          note?: string | null
          paid?: number
          site_id?: string | null
          total?: number
          user_id?: string | null
        }
        Update: {
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          invoice_number?: string
          note?: string | null
          paid?: number
          site_id?: string | null
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_accounts: {
        Row: {
          balance: number
          company_id: string | null
          created_at: string
          employee_id: string
          id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          company_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          company_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_transactions: {
        Row: {
          account_id: string
          amount: number
          approved_by: string | null
          company_id: string | null
          created_at: string
          employee_id: string
          id: string
          kind: string
          note: string | null
          requested_by: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          approved_by?: string | null
          company_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          kind: string
          note?: string | null
          requested_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          approved_by?: string | null
          company_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          kind?: string
          note?: string | null
          requested_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          kind: string
          name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: string
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: string
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_audits: {
        Row: {
          company_id: string | null
          counted_units: number
          created_at: string
          difference_units: number
          expected_units: number
          id: string
          note: string | null
          product_id: string
          site_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          counted_units?: number
          created_at?: string
          difference_units?: number
          expected_units?: number
          id?: string
          note?: string | null
          product_id: string
          site_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          counted_units?: number
          created_at?: string
          difference_units?: number
          expected_units?: number
          id?: string
          note?: string | null
          product_id?: string
          site_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          company_id: string | null
          created_at: string
          from_site_id: string
          id: string
          note: string | null
          number: string
          product_id: string
          quantity_units: number
          to_site_id: string
          unit_price: number
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          from_site_id: string
          id?: string
          note?: string | null
          number: string
          product_id: string
          quantity_units: number
          to_site_id: string
          unit_price?: number
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          from_site_id?: string
          id?: string
          note?: string | null
          number?: string
          product_id?: string
          quantity_units?: number
          to_site_id?: string
          unit_price?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sites: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          site_id: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          site_id: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_stock_count: {
        Args: {
          _counted: number
          _note: string
          _product_id: string
          _site_id: string
        }
        Returns: number
      }
      current_company_id: { Args: never; Returns: string }
      delete_invoice_document: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      delete_movement: { Args: { _id: string }; Returns: undefined }
      delete_transfer: { Args: { _id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_site_access: {
        Args: { _site_id: string; _user_id: string }
        Returns: boolean
      }
      in_my_company: { Args: { _company_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      next_document_number: { Args: { _kind: string }; Returns: string }
      perform_transfer: {
        Args: {
          _from_site: string
          _note: string
          _product_id: string
          _quantity_units: number
          _to_site: string
          _unit_price: number
        }
        Returns: {
          company_id: string | null
          created_at: string
          from_site_id: string
          id: string
          note: string | null
          number: string
          product_id: string
          quantity_units: number
          to_site_id: string
          unit_price: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      same_company_user: { Args: { _user_id: string }; Returns: boolean }
      update_movement: {
        Args: {
          _id: string
          _mode: string
          _quantity: number
          _reason: string
          _unit_price: number
        }
        Returns: undefined
      }
      update_transfer: {
        Args: { _id: string; _note: string; _quantity_units: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "employe" | "admin" | "superadmin"
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
    Enums: {
      app_role: ["employe", "admin", "superadmin"],
    },
  },
} as const

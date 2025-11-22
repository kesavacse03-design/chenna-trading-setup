export type Category = 'OPTIONS' | 'FUTURES' | string;

export interface WatchlistRow {
  id: string;
  symbol: string;
  date: string; // DD-MM-YYYY
  category: Category;
  errors?: string[];
}

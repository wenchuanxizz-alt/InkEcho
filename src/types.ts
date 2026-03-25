export interface JournalEntry {
  id: string;
  timestamp: number;
  rawTranscript: string;
  refinedText: string;
  status: 'draft' | 'refined' | 'accepted' | 'original';
}

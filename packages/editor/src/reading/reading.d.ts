import type { ReactElement, ReactNode } from "react";
import type { CompactPage } from "../rich/rich";

export interface CompactMarkdownReaderProps {
  id: string;
  value: string;
  pages?: readonly CompactPage[];
  onOpenPath?(path: string): void;
  fallback?: ReactNode;
}

export function CompactMarkdownReader(props: CompactMarkdownReaderProps): ReactElement;

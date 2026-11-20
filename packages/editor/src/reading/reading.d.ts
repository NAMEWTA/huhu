import type { ReactElement, ReactNode } from "react";
import type { CompactPage } from "../rich/rich";

export interface CompactMarkdownReaderProps {
  id: string;
  value: string;
  pages?: readonly CompactPage[];
  onOpenPath?(path: string): void;
  renderFallback?(props: { id: string; value: string; className: string }): ReactNode;
}

export function CompactMarkdownReader(props: CompactMarkdownReaderProps): ReactElement;

import type { ReactElement } from "react";
import type { CompactPage } from "../rich/rich";

export interface CompactMarkdownReaderProps {
  id: string;
  value: string;
  pages?: readonly CompactPage[];
  onOpenPath?(path: string): void;
}

export function CompactMarkdownReader(props: CompactMarkdownReaderProps): ReactElement;

import { ledgerDecimalToMinor, type LedgerRecord } from "@huhu/contracts";
import { Button, DataTable, Dialog, Select } from "@huhu/ui";
import { host, useCapability } from "@huhu/workbench";
import { Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import type { Book } from "../shared/books.js";
import type { AccountsView, BatchPreview, InputBatch, RecordFilters, RecordsPage, RecordView } from "../shared/entries.js";
import type { CsvResult } from "../shared/imports.js";
import { defaultCards, type ReportCards } from "../shared/reports.js";
import { FinancialNotesButton } from "./FinancialNotes.js";
import { ImportWizard } from "./ImportWizard.js";
import { OverviewActivityCards, OverviewReportCharts, type CycleTarget } from "./OverviewActivity.js";
import { ReconciliationDialog, type ReconciliationTarget } from "./ReconciliationDialog.js";
import { AttachmentsDialog, RecordEditor, recordKinds } from "./RecordEditor.js";
import { bookVersion, currencies, displayMoney, downloadFile, fieldValue, LedgerField, useLedgerAction } from "./primitives.js";

type Editor = { book: Book; row?: RecordView };
type Batch = { input: z.infer<typeof InputBatch>; preview: BatchPreview };
const pageSize = 25;

function amount(record: LedgerRecord) {
  return record.type === "transfer" ? `${displayMoney(record.fromAmountMinor, record.fromCurrency)} → ${displayMoney(record.toAmountMinor, record.toCurrency)}` : displayMoney(record.amountMinor, record.currency);
}

export function RecordsSection({
  book,
  readOnly,
  openResource,
  quickEntry,
  consumeQuickEntry,
  linkedRecordId,
  closeLinkedRecord,
}: {
  book: Book;
  readOnly: boolean;
  quickEntry: boolean;
  consumeQuickEntry(): void;
  linkedRecordId: string | undefined;
  closeLinkedRecord(): void;
  openResource(path: string): void;
}) {
  const [filters, setFilters] = useState<RecordFilters>({});
  const [page, setPage] = useState(1);
  const [formVersion, setFormVersion] = useState(0);
  const records = useCapability<RecordsPage>("ledger.records.list", { bookId: book.id, filters, page, pageSize });
  const accounts = useCapability<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const [editor, setEditor] = useState<Editor>();
  const [attachment, setAttachment] = useState<string>();
  const [importOpen, setImportOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationTarget>();
  const [selection, setSelection] = useState<RecordView[]>([]);
  const [batchAction, setBatchAction] = useState<"update" | "delete">();
  const [batch, setBatch] = useState<Batch>();
  const [batchField, setBatchField] = useState("memo");
  const [localError, setLocalError] = useState<string>();
  const dialogForm = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const action = useLedgerAction();
  const locked = readOnly || book.status === "archived";
  const view = accounts.data;
  const data = records.data;

  useEffect(() => {
    if (quickEntry && view && !locked) {
      setEditor({ book: view.book });
      consumeQuickEntry();
    }
  }, [consumeQuickEntry, locked, quickEntry, view]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(undefined);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => fieldValue(form, name);
    const from = value("from");
    const to = value("to");
    const type = value("type") as RecordFilters["type"];
    const currency = value("currency") as RecordFilters["currency"];
    const min = value("min");
    const max = value("max");
    try {
      if (from && to && from > to) throw new Error("开始日期须早于或等于结束日期");
      if ((min || max) && !currency) throw new Error("筛选金额时请选择对应币种");
      const minMinor = min ? ledgerDecimalToMinor(min, currency!) : undefined;
      const maxMinor = max ? ledgerDecimalToMinor(max, currency!) : undefined;
      if (minMinor && maxMinor && BigInt(minMinor) > BigInt(maxMinor)) throw new Error("最小金额须小于或等于最大金额");
      setFilters({
        ...(from && { from }),
        ...(to && { to }),
        ...(type && { type }),
        ...(currency && { currency }),
        ...(minMinor && { minMinor }),
        ...(maxMinor && { maxMinor }),
        ...(value("offset") && { offset: value("offset") === "yes" }),
        ...Object.fromEntries(["query", "accountId", "toAccountId", "categoryId", "tagId", "payee", "memo"].flatMap((name) => (value(name) ? [[name, value(name)]] : []))),
      });
      setSelection([]);
      setPage(1);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "请检查筛选条件");
    }
  }

  function openBatch(kind: "update" | "delete") {
    action.clearError();
    setBatch(undefined);
    setBatchField("memo");
    setBatchAction(kind);
  }

  async function exportSelection() {
    const result = await action.run<import("zod").infer<typeof CsvResult>>("ledger.exports.csv", { bookId: book.id, filters }, false);
    if (!result) return;
    try {
      const desktop = host();
      if (desktop) await desktop.saveTextFile(result.fileName, result.csv);
      else downloadFile(result.fileName, new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    } catch {
      action.setError("无法保存导出的 CSV");
    }
  }

  async function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !batchAction) return;
    if (batch) {
      if (await action.run("ledger.records.confirmBatch", { ...batch.input, previewId: batch.preview.previewId })) {
        setSelection([]);
        setPage(1);
        setBatchAction(undefined);
        setBatch(undefined);
      }
      return;
    }
    const form = new FormData(event.currentTarget);
    const next = fieldValue(form, "value");
    const patch = batchField === "tagIds" ? { tagIds: next ? [next] : [] } : batchField === "categoryId" ? { categoryId: next || null } : batchField === "payee" ? { payee: next || null } : { memo: next || null };
    const input: z.infer<typeof InputBatch> = {
      ...bookVersion(data.book),
      selection: selection.map(({ record }) => ({ recordId: record.id, recordRevision: record.revision })),
      action: batchAction === "delete" ? { kind: "delete" } : { kind: "update", patch },
    };
    const preview = await action.run<BatchPreview>("ledger.records.previewBatch", input, false);
    if (preview) setBatch({ input, preview });
  }

  if (accounts.isPending) return <p role="status">正在读取资金账户…</p>;
  if (accounts.isError) return <p role="alert">{accounts.error.message}</p>;
  if (!view) return null;
  const currencyOptions = [...new Set([...currencies, book.defaultCurrency, ...view.accounts.map(({ currency }) => currency)])];
  const optionAccounts = view.accounts.map(({ id, name }) => (
    <option key={id} value={id}>
      {name}
    </option>
  ));
  const dictionaryOptions = (kind: "category" | "tag", activeOnly = false) =>
    view.dictionary
      .filter((entry) => entry.kind === kind && (!activeOnly || entry.status === "active"))
      .map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ));

  return (
    <section className="hu-stack" aria-label="流水">
      <div className="hu-toolbar">
        <h2>流水</h2>
        <Button disabled={locked} onClick={() => setImportOpen(true)}>
          导入账单
        </Button>
        <Button disabled={action.working} onClick={() => void exportSelection()}>
          导出筛选 CSV
        </Button>
        <Button disabled={locked} onClick={() => setReconciliation({ mode: "merge" })}>
          去重
        </Button>
        <Button disabled={locked} onClick={() => setReconciliation({ mode: "offset" })}>
          查找平账
        </Button>
        <Button icon={Plus} variant="primary" disabled={locked || !view.accounts.some(({ status }) => status === "active")} onClick={() => setEditor({ book: view.book })}>
          记一笔
        </Button>
      </div>
      <form key={formVersion} className="hu-stack" aria-label="筛选流水" onSubmit={applyFilters}>
        <div className="hu-toolbar">
          <LedgerField label="搜索流水">
            <input type="search" name="query" maxLength={500} />
          </LedgerField>
          <LedgerField label="从">
            <input type="date" name="from" />
          </LedgerField>
          <LedgerField label="至">
            <input type="date" name="to" />
          </LedgerField>
          <LedgerField label="类型">
            <Select name="type">
              <option value="">全部类型</option>
              {Object.entries(recordKinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </LedgerField>
        </div>
        <details>
          <summary>更多筛选</summary>
          <div className="hu-toolbar">
            <LedgerField label="账户">
              <Select name="accountId">
                <option value="">全部</option>
                {optionAccounts}
              </Select>
            </LedgerField>
            <LedgerField label="转入账户">
              <Select name="toAccountId">
                <option value="">全部</option>
                {optionAccounts}
              </Select>
            </LedgerField>
            <LedgerField label="币种">
              <Select name="currency">
                <option value="">全部</option>
                {currencyOptions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </LedgerField>
            <LedgerField label="分类">
              <Select name="categoryId">
                <option value="">全部</option>
                {dictionaryOptions("category")}
              </Select>
            </LedgerField>
            <LedgerField label="标签">
              <Select name="tagId">
                <option value="">全部</option>
                {dictionaryOptions("tag")}
              </Select>
            </LedgerField>
            <LedgerField label="平账状态">
              <Select name="offset">
                <option value="">全部</option>
                <option value="yes">已平账</option>
                <option value="no">未平账</option>
              </Select>
            </LedgerField>
            <LedgerField label="最小金额">
              <input name="min" inputMode="decimal" />
            </LedgerField>
            <LedgerField label="最大金额">
              <input name="max" inputMode="decimal" />
            </LedgerField>
            <LedgerField label="交易对方">
              <input name="payee" maxLength={500} />
            </LedgerField>
            <LedgerField label="备注包含">
              <input name="memo" maxLength={500} />
            </LedgerField>
          </div>
        </details>
        <div className="hu-toolbar">
          <Button type="submit">应用筛选</Button>
          <Button
            onClick={() => {
              setFilters({});
              setFormVersion(formVersion + 1);
              setPage(1);
              setLocalError(undefined);
              setSelection([]);
            }}
          >
            清除筛选
          </Button>
        </div>
      </form>
      {(localError || (!batchAction && action.error)) && <p role="alert">{localError ?? action.error}</p>}
      {records.isPending ? (
        <p role="status">正在读取流水…</p>
      ) : records.isError ? (
        <p role="alert">{records.error.message}</p>
      ) : (
        data && (
          <>
            <div className="hu-toolbar">
              <h3>流水明细</h3>
              <p role="status">{data.total} 笔</p>
              {selection.length > 0 && !locked && (
                <>
                  <Button onClick={() => openBatch("update")}>批量编辑 {selection.length} 笔</Button>
                  <Button variant="danger" onClick={() => openBatch("delete")}>
                    批量删除 {selection.length} 笔
                  </Button>
                </>
              )}
            </div>
            {data.totals.length > 0 && (
              <ul aria-label="筛选汇总">
                {data.totals.map((total) => (
                  <li key={total.currency}>
                    {total.currency} · 收入 {displayMoney(total.incomeMinor, total.currency)} · 支出 {displayMoney(total.expenseMinor, total.currency)}
                    {" · 净收入 "}
                    {displayMoney(total.netMinor, total.currency)} · 转入 {displayMoney(total.transferInMinor, total.currency)} · 转出 {displayMoney(total.transferOutMinor, total.currency)}
                  </li>
                ))}
              </ul>
            )}
            <DataTable
              label="流水明细"
              rows={data.rows}
              rowKey={(row) => row.record.id}
              empty={<p>没有匹配的流水。</p>}
              columns={[
                {
                  id: "select",
                  header: "选择",
                  cell: (row) => (
                    <input
                      type="checkbox"
                      aria-label={`选择 ${row.title}`}
                      disabled={locked}
                      checked={selection.some(({ record }) => record.id === row.record.id)}
                      onChange={(event) => setSelection(event.currentTarget.checked ? [...selection, row] : selection.filter(({ record }) => record.id !== row.record.id))}
                    />
                  ),
                },
                {
                  id: "title",
                  header: "事项",
                  cell: (row) => (
                    <span>
                      {row.title}
                      {row.offset ? " · 已平账" : ""}
                      {row.legacyOffset ? " · 旧报表排除" : ""}
                    </span>
                  ),
                },
                { id: "date", header: "业务日", cell: (row) => row.businessDate },
                { id: "type", header: "类型", cell: ({ record }) => recordKinds[record.type] },
                {
                  id: "account",
                  header: "资金账户",
                  cell: ({ record }) => {
                    const name = (id: string) => view.accounts.find((row) => row.id === id)?.name ?? "原账户已缺失";
                    return record.type === "transfer" ? name(record.fromAccountId) + " → " + name(record.toAccountId) : name(record.accountId);
                  },
                },
                { id: "amount", header: "金额", cell: ({ record }) => amount(record) },
                {
                  id: "actions",
                  header: "操作",
                  cell: (row) => (
                    <div className="hu-toolbar">
                      <Button disabled={locked} aria-label={`编辑 ${row.title}`} onClick={() => setEditor({ book: data.book, row })}>
                        编辑
                      </Button>
                      <Button
                        disabled={locked || action.working}
                        aria-label={`复制 ${row.title}`}
                        onClick={() =>
                          void action.run("ledger.records.clone", {
                            ...bookVersion(data.book),
                            recordId: row.record.id,
                            recordRevision: row.record.revision,
                          })
                        }
                      >
                        复制
                      </Button>
                      <Button aria-label={`凭证 ${row.title}`} onClick={() => setAttachment(row.record.id)}>
                        凭证{row.attachments.some(({ missing }) => missing) ? " · 缺失" : row.attachments.length ? ` ${row.attachments.length}` : ""}
                      </Button>
                      <FinancialNotesButton book={book} owner={{ kind: "record", id: row.record.id }} title={row.title} readOnly={readOnly} openResource={openResource} />
                      {row.record.type !== "transfer" && (
                        <Button disabled={locked} aria-label={`${row.offset ? "撤销平账" : "平账"} ${row.title}`} onClick={() => setReconciliation({ mode: row.offset ? "undo" : "offset", recordId: row.record.id })}>
                          {row.offset ? "撤销平账" : "平账"}
                        </Button>
                      )}
                      {row.legacyOffset && (
                        <Button
                          disabled={locked || action.working}
                          onClick={() =>
                            void action.run("ledger.reconciliation.clearLegacyOffset", {
                              ...bookVersion(data.book),
                              recordId: row.record.id,
                            })
                          }
                        >
                          清除旧平账标记
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <div className="hu-toolbar" aria-label="分页">
              <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span>第 {page} 页</span>
              <Button disabled={page * pageSize >= data.total} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          </>
        )
      )}
      {editor && <RecordEditor book={editor.book} view={view} {...(editor.row && { row: editor.row })} onClose={() => setEditor(undefined)} />}
      {linkedRecordId && <LinkedRecord book={book} recordId={linkedRecordId} close={closeLinkedRecord} />}
      {importOpen && <ImportWizard view={view} onClose={() => setImportOpen(false)} />}
      {reconciliation && <ReconciliationDialog view={view} target={reconciliation} filters={filters} onClose={() => setReconciliation(undefined)} />}
      {attachment && <AttachmentsDialog book={data?.book ?? view.book} recordId={attachment} readOnly={locked} onClose={() => setAttachment(undefined)} />}
      {batchAction && (
        <Dialog
          open
          title={batchAction === "delete" ? "批量删除流水" : "批量编辑流水"}
          error={action.error}
          onClose={() => {
            if (!action.working) setBatchAction(undefined);
          }}
          initialFocusRef={cancel}
          actions={
            <>
              <Button ref={cancel} disabled={action.working} onClick={() => setBatchAction(undefined)}>
                取消
              </Button>
              <Button type="submit" form={dialogForm} variant={batchAction === "delete" && batch ? "danger" : "primary"} disabled={action.working}>
                {batch ? (batchAction === "delete" ? "确认删除" : "确认修改") : "预览变更"}
              </Button>
            </>
          }
        >
          <form id={dialogForm} className="hu-stack" onSubmit={submitBatch}>
            <p>已选 {selection.length} 笔流水。</p>
            {batch ? (
              <p>
                此次变更涉及 {batch.preview.count} 笔和 {batch.preview.attachmentCount} 份受管凭证。
              </p>
            ) : (
              batchAction === "update" && (
                <>
                  <LedgerField label="修改字段">
                    <Select value={batchField} onChange={(event) => setBatchField(event.currentTarget.value)}>
                      <option value="memo">备注</option>
                      <option value="payee">交易对方</option>
                      <option value="categoryId">分类</option>
                      <option value="tagIds">标签</option>
                    </Select>
                  </LedgerField>
                  <LedgerField label="新值">
                    {batchField === "categoryId" || batchField === "tagIds" ? (
                      <Select key={batchField} name="value">
                        <option value="">清空</option>
                        {dictionaryOptions(batchField === "categoryId" ? "category" : "tag", true)}
                      </Select>
                    ) : (
                      <input key={batchField} name="value" maxLength={500} />
                    )}
                  </LedgerField>
                </>
              )
            )}
          </form>
        </Dialog>
      )}
    </section>
  );
}

function LinkedRecord({ book, recordId, close }: { book: Book; recordId: string; close(): void }) {
  const result = useCapability<RecordView>("ledger.records.get", { bookId: book.id, recordId });
  return (
    <Dialog open title="查看流水" error={result.error?.message} onClose={close} actions={<Button onClick={close}>关闭</Button>}>
      {result.isPending && <p role="status">正在读取流水…</p>}
      {result.data && (
        <div className="hu-stack">
          <h3>{result.data.title}</h3>
          <p>
            <time dateTime={result.data.businessDate}>{result.data.businessDate}</time> · {amount(result.data.record)}
          </p>
          {result.data.record.memo && <p>{result.data.record.memo}</p>}
        </div>
      )}
    </Dialog>
  );
}

const cardLabels = { summary: "本月汇总", recent: "最近流水", balances: "账户余额" };

export function Overview({
  book,
  readOnly,
  openResource,
  onSection,
  onRecord,
  onCycle,
}: {
  book: Book;
  readOnly: boolean;
  openResource(path: string): void;
  onSection(section: string): void;
  onRecord(): void;
  onCycle(target: CycleTarget): void;
}) {
  const accounts = useCapability<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const prefs = useCapability<{ revision: string; cards: ReportCards }>("ledger.reports.preferences", { bookId: book.id });
  const action = useLedgerAction();
  const [draft, setDraft] = useState<{ revision: string; cards: ReportCards } | null>(null);
  const cards = prefs.data?.cards ?? defaultCards;
  const open = book.status === "active" && !readOnly;
  const day = accounts.data?.businessDate;
  const records = useCapability<RecordsPage>(
    "ledger.records.list",
    {
      bookId: book.id,
      pageSize: 5,
      filters: day ? { from: day.slice(0, 7) + "-01", to: day, offset: false } : {},
    },
    { enabled: !!day && cards.some(({ id, visible }) => visible && id !== "balances") },
  );

  function move(index: number, delta: number) {
    if (!draft) return;
    const next = [...draft.cards];
    const other = index + delta;
    if (!next[index] || !next[other]) return;
    [next[index], next[other]] = [next[other], next[index]];
    setDraft({ ...draft, cards: next });
  }
  async function save() {
    if (!draft) return;
    const updated = await action.run("ledger.reports.savePreferences", { bookId: book.id, expectedRevision: draft.revision, cards: draft.cards });
    if (updated) setDraft(null);
  }
  return (
    <section className="hu-stack" aria-label="账本总览">
      <div className="hu-toolbar">
        <h2>{book.name}</h2>
        <Button icon={Plus} variant="primary" disabled={!open} onClick={onRecord}>
          记一笔
        </Button>
        <FinancialNotesButton book={book} owner={{ kind: "book" }} title={book.name} readOnly={readOnly} openResource={openResource} />
        {open && prefs.data ? (
          <Button
            onClick={() => {
              action.clearError();
              setDraft(structuredClone(prefs.data!));
            }}
          >
            调整总览卡片
          </Button>
        ) : null}
      </div>
      <p>
        默认币种 {book.defaultCurrency} · 业务时区 {book.timeZone}
        {book.status === "archived" ? " · 已归档" : ""}
      </p>
      {accounts.error || records.error || prefs.error ? <p role="alert">{accounts.error?.message ?? records.error?.message ?? prefs.error?.message}</p> : null}
      {cards
        .filter(({ visible }) => visible)
        .map(({ id }) => (
          <section key={id} className="hu-stack">
            <div className="hu-toolbar">
              <h3>{cardLabels[id]}</h3>
              <Button onClick={() => onSection(id === "summary" ? "reports" : id === "recent" ? "records" : "accounts")}>{id === "summary" ? "查看报表" : id === "recent" ? "全部流水" : "管理账户"}</Button>
            </div>
            {id === "summary" && records.data ? (
              records.data.totals.length ? (
                records.data.totals.map((total) => (
                  <dl key={total.currency} aria-label={total.currency + " 本月汇总"}>
                    <dt>本月收入</dt>
                    <dd>{displayMoney(total.incomeMinor, total.currency)}</dd>
                    <dt>本月支出</dt>
                    <dd>{displayMoney(total.expenseMinor, total.currency)}</dd>
                    <dt>本月净收入</dt>
                    <dd>{displayMoney(total.netMinor, total.currency)}</dd>
                  </dl>
                ))
              ) : (
                <p>本月暂无收支。</p>
              )
            ) : null}
            {id === "summary" && day ? <OverviewReportCharts book={book} today={day} /> : null}
            {id === "recent" && records.data ? (
              records.data.rows.length ? (
                <ul>
                  {records.data.rows.map((row) => (
                    <li key={row.record.id}>
                      {row.title} · {amount(row.record)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>本月还没有流水。</p>
              )
            ) : null}
            {id === "balances" && accounts.data ? (
              <ul>
                {accounts.data.accounts.map((account) => (
                  <li key={account.id}>
                    {account.name} · {displayMoney(account.balanceMinor, account.currency)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      <OverviewActivityCards book={book} openBudgets={() => onSection("budgets")} openCycles={onCycle} />
      {draft ? (
        <Dialog
          open
          title="调整总览卡片"
          error={action.error}
          onClose={() => {
            if (!action.working) setDraft(null);
          }}
          actions={
            <Button loading={action.working} onClick={() => void save()}>
              保存卡片
            </Button>
          }
        >
          <ul>
            {draft.cards.map(({ id, visible }, index) => (
              <li key={id} className="hu-toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(event) => {
                      setDraft({ ...draft, cards: draft.cards.map((card) => (card.id === id ? { ...card, visible: event.currentTarget.checked } : card)) });
                    }}
                  />{" "}
                  {cardLabels[id]}
                </label>
                <Button aria-label={`上移 ${cardLabels[id]}`} disabled={index === 0} onClick={() => move(index, -1)}>
                  上移
                </Button>
                <Button aria-label={`下移 ${cardLabels[id]}`} disabled={index === draft.cards.length - 1} onClick={() => move(index, 1)}>
                  下移
                </Button>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </section>
  );
}

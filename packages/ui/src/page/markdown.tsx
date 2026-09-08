import { lexer, type Token, type Tokens } from "marked";
import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface MarkdownProps {
  source: string;
}

export function Markdown(props: MarkdownProps) {
  const tokens = createMemo(() => lexer(props.source, { gfm: true }));
  return <Blocks tokens={tokens()} />;
}

export function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => entities[name] ?? "");
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

function Blocks(props: { tokens: Token[] }) {
  return <For each={props.tokens}>{(token) => <Block token={token} />}</For>;
}

function Block(props: { token: Token }) {
  const token = () => props.token;
  return (
    <Switch fallback={<Inline token={token()} />}>
      <Match when={is<Tokens.Heading>(token(), "heading")}>
        {(heading) => (
          <Dynamic component={`h${Math.min(heading().depth, 4)}`} class="kw-heading">
            <span class="kw-heading-mark" aria-hidden="true">
              ▍
            </span>
            <Inlines tokens={heading().tokens} />
          </Dynamic>
        )}
      </Match>
      <Match when={is<Tokens.Paragraph>(token(), "paragraph")}>
        {(paragraph) => (
          <p class="kw-paragraph">
            <Inlines tokens={paragraph().tokens} />
          </p>
        )}
      </Match>
      <Match when={is<Tokens.List>(token(), "list")}>{(list) => <List list={list()} />}</Match>
      <Match when={is<Tokens.Code>(token(), "code")}>{(code) => <Fence code={code()} />}</Match>
      <Match when={is<Tokens.Blockquote>(token(), "blockquote")}>
        {(quote) => (
          <blockquote class="kw-quote">
            <Blocks tokens={quote().tokens} />
          </blockquote>
        )}
      </Match>
      <Match when={is<Tokens.Table>(token(), "table")}>
        {(table) => <Table table={table()} />}
      </Match>
      <Match when={is<Tokens.Hr>(token(), "hr")}>
        <hr class="kw-rule" />
      </Match>
      <Match when={is<Tokens.Space>(token(), "space")}>{null}</Match>
      <Match when={is<Tokens.HTML>(token(), "html")}>
        {(html) => <p class="kw-paragraph">{html().text}</p>}
      </Match>
      <Match when={is<Tokens.Text>(token(), "text")}>
        {(text) => (
          <Show when={text().tokens} fallback={<>{decodeEntities(text().text)}</>}>
            {(inline) => <Inlines tokens={inline()} />}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

function List(props: { list: Tokens.List }) {
  return (
    <Dynamic
      component={props.list.ordered ? "ol" : "ul"}
      class="kw-list"
      start={props.list.ordered && props.list.start !== "" ? props.list.start : undefined}
    >
      <For each={props.list.items}>
        {(item) => (
          <li
            class="kw-list-item"
            data-task={item.task ? String(item.checked === true) : undefined}
          >
            <Blocks tokens={item.tokens} />
          </li>
        )}
      </For>
    </Dynamic>
  );
}

function Fence(props: { code: Tokens.Code }) {
  return (
    <pre class="kw-fence" data-lang={props.code.lang || undefined}>
      <Show when={props.code.lang}>
        <span class="kw-fence-lang">{props.code.lang}</span>
      </Show>
      <code>{props.code.text}</code>
    </pre>
  );
}

function Table(props: { table: Tokens.Table }) {
  return (
    <div class="kw-table-scroll">
      <table class="kw-table">
        <thead>
          <tr>
            <For each={props.table.header}>
              {(cell) => (
                <th style={cellAlign(cell.align)}>
                  <Inlines tokens={cell.tokens} />
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.table.rows}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(cell) => (
                    <td style={cellAlign(cell.align)}>
                      <Inlines tokens={cell.tokens} />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function Inlines(props: { tokens: Token[] }) {
  return <For each={props.tokens}>{(token) => <Inline token={token} />}</For>;
}

function Inline(props: { token: Token }) {
  const token = () => props.token;
  return (
    <Switch fallback={<>{textOf(token())}</>}>
      <Match when={is<Tokens.Strong>(token(), "strong")}>
        {(strong) => (
          <strong>
            <Inlines tokens={strong().tokens} />
          </strong>
        )}
      </Match>
      <Match when={is<Tokens.Em>(token(), "em")}>
        {(em) => (
          <em>
            <Inlines tokens={em().tokens} />
          </em>
        )}
      </Match>
      <Match when={is<Tokens.Del>(token(), "del")}>
        {(del) => (
          <del>
            <Inlines tokens={del().tokens} />
          </del>
        )}
      </Match>
      <Match when={is<Tokens.Codespan>(token(), "codespan")}>
        {(span) => <code class="kw-codespan">{decodeEntities(span().text)}</code>}
      </Match>
      <Match when={is<Tokens.Link>(token(), "link")}>
        {(link) => (
          <a class="kw-link" href={safeHref(link().href)} title={link().title ?? undefined}>
            <Inlines tokens={link().tokens} />
          </a>
        )}
      </Match>
      <Match when={is<Tokens.Image>(token(), "image")}>
        {(image) => <span class="kw-image-ref">[image: {image().text || image().href}]</span>}
      </Match>
      <Match when={is<Tokens.Br>(token(), "br")}>
        <br />
      </Match>
      <Match when={nestedText(token())}>{(nested) => <Inlines tokens={nested()} />}</Match>
    </Switch>
  );
}

function is<T extends Token>(token: Token, type: T["type"]): T | undefined {
  return token.type === type ? (token as T) : undefined;
}

function nestedText(token: Token): Token[] | undefined {
  const text = is<Tokens.Text>(token, "text");
  return text?.tokens;
}

function textOf(token: Token): string {
  const text = "text" in token && typeof token.text === "string" ? token.text : token.raw;
  return decodeEntities(text);
}

function safeHref(href: string): string | undefined {
  return /^(https?:|mailto:|#)/i.test(href) ? href : undefined;
}

function cellAlign(align: "center" | "left" | "right" | null): JSX.CSSProperties | undefined {
  return align === null ? undefined : { "text-align": align };
}

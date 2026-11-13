import type { Token, Tokens } from "marked";
import {
  createContext,
  createMemo,
  createUniqueId,
  Index,
  type JSX,
  Match,
  Show,
  Switch,
  useContext,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { Fence } from "./fence.tsx";
import { useMarkdownHost } from "./markdown-host.ts";
import {
  type FootnoteRefToken,
  type FootnoteToken,
  keepUnchanged,
  lexMarkdown,
} from "./markdown-tokens.ts";

export interface MarkdownProps {
  source: string;
}

export function Markdown(props: MarkdownProps) {
  const blocks = createMemo<Token[]>(
    (before) => keepUnchanged(before, lexMarkdown(props.source)),
    [],
  );
  const scope = createUniqueId();
  return (
    <FootnoteScope.Provider value={(label) => `${scope}-footnote-${label}`}>
      <Blocks tokens={blocks()} />
    </FootnoteScope.Provider>
  );
}

export function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => entities[name] ?? "");
}

export const externalLinkHint = "opens in your browser";

export function linkTitle(href: string, title?: string | null): string {
  const destination = `${href} · ${externalLinkHint}`;
  return title ? `${title} · ${destination}` : destination;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

const FootnoteScope = createContext<(label: string) => string>((label) => `footnote-${label}`);

function Blocks(props: { tokens: Token[] }) {
  return <Index each={props.tokens}>{(token) => <Block token={token()} />}</Index>;
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
      <Match when={is<FootnoteToken>(token(), "footnote")}>
        {(footnote) => <Footnote footnote={footnote()} />}
      </Match>
      <Match when={is<Tokens.Space>(token(), "space") ?? is<Tokens.Def>(token(), "def")}>
        {null}
      </Match>
      <Match when={is<Tokens.HTML>(token(), "html")}>
        {(html) => <p class="kw-paragraph">{html().text}</p>}
      </Match>
      <Match when={is<Tokens.Text>(token(), "text")}>
        {(text) => (
          <Show when={text().tokens} fallback={decodeEntities(text().text)}>
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
      <Index each={props.list.items}>
        {(item) => (
          <li
            class="kw-list-item"
            data-task={item().task ? String(item().checked === true) : undefined}
          >
            <Blocks tokens={item().tokens} />
          </li>
        )}
      </Index>
    </Dynamic>
  );
}

function Table(props: { table: Tokens.Table }) {
  return (
    <div class="kw-table-scroll">
      <table class="kw-table">
        <thead>
          <tr>
            <Index each={props.table.header}>
              {(cell) => (
                <th style={cellAlign(cell().align)}>
                  <Inlines tokens={cell().tokens} />
                </th>
              )}
            </Index>
          </tr>
        </thead>
        <tbody>
          <Index each={props.table.rows}>
            {(row) => (
              <tr>
                <Index each={row()}>
                  {(cell) => (
                    <td style={cellAlign(cell().align)}>
                      <Inlines tokens={cell().tokens} />
                    </td>
                  )}
                </Index>
              </tr>
            )}
          </Index>
        </tbody>
      </table>
    </div>
  );
}

function Footnote(props: { footnote: FootnoteToken }) {
  const footnoteId = useContext(FootnoteScope);
  return (
    <p class="kw-footnote" id={footnoteId(props.footnote.label)} tabIndex={-1}>
      <span class="kw-footnote-label">{props.footnote.label}</span>
      <Inlines tokens={props.footnote.tokens} />
    </p>
  );
}

function Inlines(props: { tokens: Token[] }) {
  return <Index each={props.tokens}>{(token) => <Inline token={token()} />}</Index>;
}

function Inline(props: { token: Token }) {
  const token = () => props.token;
  return (
    <Switch fallback={textOf(token())}>
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
      <Match when={is<Tokens.Link>(token(), "link")}>{(link) => <Link link={link()} />}</Match>
      <Match when={is<Tokens.Checkbox>(token(), "checkbox")}>
        {(box) => <input type="checkbox" class="kw-task-box" checked={box().checked} disabled />}
      </Match>
      <Match when={is<FootnoteRefToken>(token(), "footnoteRef")}>
        {(reference) => <FootnoteReference label={reference().label} />}
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

function Link(props: { link: Tokens.Link }) {
  const host = useMarkdownHost();
  const destination = () => openableHref(props.link.href);
  const open = (event: MouseEvent): void => {
    const href = destination();
    if (host === undefined || href === undefined || !opensALink(event)) return;
    event.preventDefault();
    void host.openExternal(href);
  };
  return (
    <Show
      when={destination()}
      fallback={
        <span class="kw-link-inert" title={props.link.href}>
          <Inlines tokens={props.link.tokens} />
        </span>
      }
    >
      {(href) => (
        <a
          class="kw-link"
          href={href()}
          title={linkTitle(href(), props.link.title)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={open}
          onAuxClick={open}
        >
          <Inlines tokens={props.link.tokens} />
        </a>
      )}
    </Show>
  );
}

function FootnoteReference(props: { label: string }) {
  const footnoteId = useContext(FootnoteScope);
  const jump = (event: MouseEvent): void => {
    event.preventDefault();
    const footnote = document.getElementById(footnoteId(props.label));
    footnote?.focus({ preventScroll: true });
    footnote?.scrollIntoView({ block: "nearest" });
  };
  return (
    <sup class="kw-footnote-ref">
      <a href={`#${footnoteId(props.label)}`} aria-label={`footnote ${props.label}`} onClick={jump}>
        {props.label}
      </a>
    </sup>
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

function openableHref(href: string): string | undefined {
  return /^https?:\/\//i.test(href) ? href : undefined;
}

function opensALink(event: MouseEvent): boolean {
  return event.type === "click" || event.button === middleButton;
}

const middleButton = 1;

function cellAlign(align: "center" | "left" | "right" | null): JSX.CSSProperties | undefined {
  return align === null ? undefined : { "text-align": align };
}

import type { InheritedClasses, InheritedModel } from "@keywork-app/protocol";
import type { ServerReading } from "./workshop.ts";

export const at = "2026-11-05T12:00:00.000Z";

export const noWorkshops: ServerReading = { status: 200, body: { workshops: [] } };

export const sbxWorkshops: ServerReading = {
  status: 200,
  body: {
    workshops: [
      {
        id: "w-old",
        creature: "old",
        substrate: "sbx",
        state: "stopped",
        workdir: "/home/sbx",
        brokers: [],
        limitations: [],
        display: true,
        createdAt: at,
      },
    ],
  },
};

export const workshopsUnserved: ServerReading = {
  status: 503,
  body: { error: "this host serves no workshops" },
};

const health = { state: "up", resident: true, detail: "", checkedAt: at };

const cost = { source: "local_estimate", usdPerMillionInput: 0, usdPerMillionOutput: 0 };

const openrouter = {
  kind: "openrouter",
  protocol: "chat-completions",
  root: "https://openrouter.ai/api/v1",
};

const openai = {
  kind: "openai",
  protocol: "responses",
  root: "https://api.openai.com/v1",
};

const listedByTheRegistry = {
  state: "up",
  resident: null,
  detail: "listed by the inference registry; not probed",
  checkedAt: at,
};

export const localModels: ServerReading = {
  status: 200,
  body: {
    generatedAt: at,
    nodes: [
      {
        node: "moak-main",
        servers: [
          {
            kind: "ollama",
            root: "http://127.0.0.1:11434",
            port: 11434,
            source: "probed",
            auth: "none",
            fingerprint: "ollama 0.40.14",
            version: "0.40.14",
            health,
            models: [
              {
                id: "qwen3:32b",
                installed: true,
                loaded: true,
                contextAllocated: 65536,
                health,
                classes: ["strong", "loop"],
                ineligible: [],
                license: "Apache-2.0",
                licenseAcknowledgement: "not-required",
                cost,
              },
              {
                id: "qwen3:8b",
                installed: true,
                loaded: false,
                contextAllocated: 65536,
                health,
                classes: ["loop"],
                ineligible: [{ class: "strong", missing: ["context 128K"] }],
                license: "Apache-2.0",
                licenseAcknowledgement: "not-required",
                cost,
              },
              {
                id: "moondream",
                installed: true,
                loaded: false,
                contextAllocated: 4096,
                health,
                classes: ["vision"],
                ineligible: [],
                license: "Apache-2.0",
                licenseAcknowledgement: "not-required",
                cost,
              },
            ],
          },
          {
            kind: "llama-server",
            root: "http://127.0.0.1:9931",
            port: 9931,
            source: "probed",
            auth: "none",
            fingerprint: "llama-server b12122",
            version: "b12122",
            health: { ...health, state: "down" },
            models: [
              {
                id: "gemma-3-27b",
                installed: true,
                loaded: true,
                contextAllocated: 131072,
                health: { ...health, state: "down" },
                classes: ["strong", "loop", "vision"],
                ineligible: [],
                license: "Gemma",
                licenseAcknowledgement: "required",
                cost,
              },
            ],
          },
        ],
      },
    ],
  },
};

export const noModels: ServerReading = {
  status: 200,
  body: { generatedAt: at, nodes: [{ node: "moak-main", servers: [] }] },
};

export const cloudConnected: ServerReading = withMarket(noModels, [
  onTheMarketRoad(openrouter, listedByTheRegistry),
  onTheMarketRoad(openai, keyless("OPENAI_API_KEY")),
]);

export const cloudUnverified: ServerReading = withMarket(noModels, [
  onTheMarketRoad(openrouter, unanswered()),
]);

export const inheritsResolved: ServerReading = withInherits(cloudUnverified, {
  provider: "openrouter",
  model: "openai/gpt-5-mini",
});

export const inheritsRefused: ServerReading = withInherits(cloudUnverified, {
  refused: "no-credential",
  detail: "no provider holds a credential for strong",
});

const keyworksDefault = { provider: "openrouter", model: "openai/gpt-5-mini" };

export const inheritsKeyworksDefault: ServerReading = withInheritedClasses(cloudUnverified, {
  strong: keyworksDefault,
  loop: keyworksDefault,
  decide: {
    ...keyworksDefault,
    decider: "builtin",
    detail:
      "openrouter/openai/gpt-5-mini has no decision endpoint or logprobs, so the built-in decider asks it each question",
  },
  vision: keyworksDefault,
});

const unconfigured = {
  refused: "unconfigured",
  detail: "this host has no default model to inherit",
};

export const inheritsUnconfigured: ServerReading = withInherits(cloudUnverified, unconfigured);

export const nothingConnected: ServerReading = withMarket(noModels, [
  onTheMarketRoad(openrouter, keyless("OPENROUTER_API_KEY")),
  onTheMarketRoad(openai, keyless("OPENAI_API_KEY")),
]);

export const localAndCloud: ServerReading = withMarket(localModels, [
  onTheMarketRoad(openrouter, listedByTheRegistry),
]);

export const modelsUnserved: ServerReading = {
  status: 503,
  body: { error: "this host serves no model inventory" },
};

export function creatureMade(name = "Wren", slug = "wren"): ServerReading {
  return {
    status: 201,
    body: {
      slug,
      name,
      sigil: "w",
      created: at,
      skin: "kid",
      seed: 7,
      workshop: "host",
      models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
      conversation: null,
      threads: 0,
    },
  };
}

export function creaturesListed(
  rows: readonly { slug: string; name: string; seed: number }[],
): ServerReading {
  return {
    status: 200,
    body: {
      creatures: rows.map((row) => ({
        ...row,
        sigil: row.slug.slice(0, 1),
        created: at,
        skin: "kid",
        workshop: "host",
        models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
        conversation: null,
        threads: 0,
      })),
    },
  };
}

export function workshopsHeldBy(
  slugs: readonly string[],
  byIdOnly: readonly string[] = [],
): ServerReading {
  const row = (slug: string, named: boolean) => ({
    id: `${slug}-dc1057`,
    ...(named && { creature: slug }),
    substrate: "host",
    state: "stopped",
    workdir: "C:/elsewhere",
    brokers: [],
    limitations: ["bare host"],
    display: false,
    createdAt: at,
  });
  return {
    status: 200,
    body: {
      workshops: [
        ...slugs.map((slug) => row(slug, true)),
        ...byIdOnly.map((slug) => row(slug, false)),
      ],
    },
  };
}

export function nameTakenOnNode(slug: string, workshop: string): ServerReading {
  return {
    status: 409,
    body: {
      refused: "conflict",
      error: `the name ${slug} is taken on this node: workshop ${workshop} belongs to a creature made in another workspace, and two creatures never share one · choose another name, or remove that workshop first (DELETE /workshops/${workshop})`,
    },
  };
}

export const slugTaken: ServerReading = {
  status: 409,
  body: { error: "a bot already has the slug wren" },
};

export function workshopRaised(substrate: "host" | "sbx", creature = "wren"): ServerReading {
  return {
    status: 201,
    body: {
      id: `w-${creature}`,
      creature,
      substrate,
      state: "stopped",
      workdir: "/state/workshops/w-wren/home",
      brokers: [],
      limitations: substrate === "host" ? ["commands run unconfined"] : [],
      display: substrate === "sbx",
      createdAt: at,
    },
  };
}

export function creatureOpened(conversation = "s-conv", slug = "wren"): ServerReading {
  return {
    status: 200,
    body: {
      slug,
      name: "Wren",
      sigil: "w",
      created: at,
      skin: "kid",
      seed: 7,
      workshop: "host",
      models: {},
      introduction: "You are Wren.",
      conversation,
      threads: [],
      nextRun: null,
      usage: { date: "2026-11-05", sessions: 0, costNanos: null },
      routines: ".keywork/bots/wren/routines",
    },
  };
}

function withMarket(reading: ServerReading, market: readonly object[]): ServerReading {
  const inventory = reading.body as Readonly<Record<string, unknown>>;
  return { status: reading.status, body: { ...inventory, market } };
}

function onTheMarketRoad(
  provider: { kind: string; protocol: string; root: string },
  health: object,
): object {
  return {
    ...provider,
    port: 443,
    source: "registry",
    auth: "key",
    fingerprint: null,
    version: null,
    health,
    models: [],
  };
}

function withInherits(reading: ServerReading, strong: InheritedModel): ServerReading {
  return withInheritedClasses(reading, { strong, loop: strong, decide: strong, vision: strong });
}

function withInheritedClasses(reading: ServerReading, inherits: InheritedClasses): ServerReading {
  const inventory = reading.body as Readonly<Record<string, unknown>>;
  return { status: reading.status, body: { ...inventory, inherits } };
}

function unanswered(): object {
  return { state: "unverified", resident: null, detail: "no turn answered yet", checkedAt: at };
}

function keyless(variable: string): object {
  return {
    state: "down",
    resident: null,
    detail: `no credential (${variable})`,
    checkedAt: at,
  };
}

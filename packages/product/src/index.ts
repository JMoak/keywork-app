export type ProductId = "keywork" | "stead";

export interface ProductProfile {
  readonly id: ProductId;
  readonly name: string;
  readonly appId: string;
  readonly userDataName: string;
  readonly protocolScheme: string;
  readonly executableName: string;
  readonly screenKillChord: string;
  readonly updateFeed: GithubUpdateFeed;
  readonly startup: "ide" | "creature";
  readonly firstFrame: "yard" | "tiles";
}

export interface GithubUpdateFeed {
  readonly provider: "github";
  readonly owner: string;
  readonly repo: string;
}

export const keyworkProfile: ProductProfile = defineProduct("keywork", "keywork-app", {
  startup: "ide",
  firstFrame: "tiles",
});
export const steadProfile: ProductProfile = defineProduct("stead", "stead", {
  startup: "creature",
  firstFrame: "yard",
});

export const productProfiles = Object.freeze({ keywork: keyworkProfile, stead: steadProfile });

function defineProduct(
  id: ProductId,
  repository: string,
  surface: Pick<ProductProfile, "startup" | "firstFrame">,
): ProductProfile {
  return Object.freeze({
    id,
    name: id,
    appId: `dev.${id}.app`,
    userDataName: id,
    protocolScheme: id,
    executableName: id,
    screenKillChord: `CommandOrControl+Alt+Shift+${id === "keywork" ? "X" : "Y"}`,
    updateFeed: Object.freeze({ provider: "github", owner: "JMoak", repo: repository }),
    startup: surface.startup,
    firstFrame: surface.firstFrame,
  });
}

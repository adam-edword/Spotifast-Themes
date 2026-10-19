import { describe, expect, it } from "vitest";
import { moderateName } from "../moderation.ts";

describe("moderateName", () => {
  it.each([
    "Stock Green",
    "Cosmic Dusk",
    "Bad Minton",
    "Read Min",
    "Grasshopper",
    "Scunthorpe",
    "Classic Rock",
    "Assassin Red",
    "Cocktail Hour",
    "Shiitake",
    "Peacock",
    "Night 123456",
  ])("allows %s", (name) => {
    expect(moderateName(name)).toEqual([]);
  });

  it.each(["Sh1t Mode", "B1tch", "Fuuuck", "f u c k", "Dark F U C K"])(
    "rejects profanity: %s",
    (name) => {
      expect(moderateName(name)).toContain("contains a word that isn't allowed");
    },
  );

  it.each([
    ["Spotify Dark", "spotify"],
    ["Spotifydark", "spotify"],
    ["Sp0tify", "spotify"],
    ["Spot Ify", "spotify"],
    ["S P O T I F Y", "spotify"],
    ["Spotifast Pro", "spotifast"],
    ["Unofficial", "official"],
    ["Adm1n Panel", "admin"],
    ["Ad Min", "admin"],
    ["Moderator Blue", "moderator"],
  ])("rejects blocked term in %s", (name, term) => {
    expect(moderateName(name)).toContain(`can't include "${term}"`);
  });

  it.each(["Dark Com", "Neon Io", "Www Theme", "Http Blue", "My Gg"])(
    "rejects link-like name %s",
    (name) => {
      expect(moderateName(name)).toContain("looks like a link or web address");
    },
  );

  it("rejects digit-heavy names", () => {
    expect(moderateName("Night 1234567")).toContain("can't have more than 6 digits");
  });
});

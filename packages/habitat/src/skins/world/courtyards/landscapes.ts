import {
  fog,
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
  identityBase,
  identityLight,
  identityShadow,
} from "../../legend.ts";
import { type Landscape, landscape } from "./drawing.ts";
import {
  cypress,
  dockStone,
  ferns,
  olive,
  reeds,
  scree,
  seaStack,
  stoneArch,
  swordFern,
  wisps,
} from "./motifs.ts";

export function orchardTerrace() {
  const court = landscape();
  court.stamp(45, 14, wisps);
  court.bank(
    fog,
    [0, 36],
    [14, 31],
    [25, 33],
    [43, 25],
    [50, 25],
    [64, 33],
    [84, 37],
    [106, 26],
    [112, 28],
    [123, 25],
    [144, 32],
  );
  court.bank(
    groundShadow,
    [0, 38],
    [11, 35],
    [27, 35],
    [49, 41],
    [62, 43],
    [76, 42],
    [103, 34],
    [119, 32],
    [144, 34],
  );
  court.shape(groundBase, [0, 38], [16, 36], [31, 38], [49, 43], [27, 41], [13, 40], [0, 41]);
  court.shape(groundBase, [85, 42], [103, 36], [121, 34], [144, 36], [126, 36], [113, 37]);
  court.stamp(7, 27, cypress);
  court.stamp(-3, 31, cypress);
  court.stamp(116, 19, olive);
  court.bank(groundBase, [0, 43], [20, 45], [41, 50], [69, 51], [88, 49], [123, 44], [144, 44]);
  court.shape(groundLight, [0, 44], [14, 45], [35, 49], [47, 51], [36, 51], [16, 47], [0, 46]);
  court.shape(
    groundShadow,
    [64, 55],
    [87, 51],
    [119, 47],
    [144, 46],
    [144, 48],
    [119, 49],
    [84, 53],
  );
  court.marks(groundLight, [111, 47, 8], [132, 45, 9]);
  courtyardFloor(court);
  court.bank(
    groundShadow,
    [0, 72],
    [18, 72],
    [28, 74],
    [49, 77],
    [68, 81],
    [87, 83],
    [112, 80],
    [144, 71],
  );
  court.shape(
    groundBase,
    [0, 73],
    [18, 73],
    [32, 76],
    [45, 77],
    [59, 81],
    [37, 79],
    [18, 76],
    [0, 76],
  );
  court.shape(groundBase, [108, 82], [134, 75], [144, 73], [144, 76], [128, 79]);
  court.shape(groundBase, [3, 77], [14, 77], [18, 80], [17, 83], [1, 83]);
  court.shape(groundBase, [17, 77], [29, 79], [32, 83], [20, 83], [21, 81]);
  court.shape(groundBase, [31, 80], [45, 82], [47, 84], [34, 84]);
  court.shape(groundBase, [124, 81], [136, 78], [135, 82], [122, 84]);
  court.shape(groundBase, [139, 78], [144, 77], [144, 82], [137, 83]);
  court.marks(groundLight, [0, 72, 12], [20, 73, 6], [37, 76, 7], [115, 79, 5], [134, 74, 7]);
  court.marks(identityShadow, [3, 77, 12], [18, 80, 5], [25, 81, 10], [125, 82, 8], [138, 79, 6]);
  court.stamp(-3, 66, ferns);
  court.stamp(128, 60, swordFern);
  return court.frame;
}

export function quarrySteps() {
  const court = landscape();
  court.stamp(66, 18, wisps);
  court.bank(
    fog,
    [0, 22],
    [12, 21],
    [20, 29],
    [28, 29],
    [35, 35],
    [54, 36],
    [66, 32],
    [75, 32],
    [81, 36],
    [106, 36],
    [121, 29],
    [144, 29],
  );
  court.bank(
    groundShadow,
    [0, 29],
    [14, 29],
    [17, 34],
    [34, 34],
    [37, 40],
    [58, 40],
    [63, 43],
    [91, 43],
    [111, 38],
    [144, 37],
  );
  court.shape(groundBase, [0, 30], [12, 30], [15, 34], [27, 35], [7, 35], [0, 33]);
  court.shape(groundBase, [0, 37], [26, 37], [34, 40], [45, 41], [11, 41], [0, 39]);
  court.marks(groundBase, [51, 41, 8], [75, 44, 12], [101, 40, 10]);
  court.stamp(115, 22, stoneArch);
  court.bank(
    groundBase,
    [0, 43],
    [23, 43],
    [31, 47],
    [48, 47],
    [54, 51],
    [98, 51],
    [107, 47],
    [117, 46],
    [121, 43],
    [144, 43],
  );
  court.shape(
    groundLight,
    [102, 50],
    [116, 47],
    [123, 44],
    [144, 44],
    [144, 46],
    [123, 46],
    [117, 48],
  );
  court.marks(groundShadow, [1, 45, 18], [12, 48, 11], [119, 49, 19], [112, 51, 9]);
  courtyardFloor(court);
  court.bank(
    groundShadow,
    [0, 70],
    [20, 70],
    [24, 73],
    [47, 73],
    [52, 77],
    [76, 77],
    [81, 81],
    [109, 81],
    [117, 76],
    [131, 76],
    [135, 70],
    [144, 70],
  );
  court.shape(
    groundBase,
    [0, 70],
    [16, 70],
    [22, 74],
    [43, 74],
    [48, 77],
    [33, 77],
    [28, 75],
    [7, 75],
    [0, 73],
  );
  court.shape(groundLight, [0, 70], [17, 70], [21, 72], [3, 72]);
  court.shape(
    groundBase,
    [113, 80],
    [119, 76],
    [132, 76],
    [138, 71],
    [144, 71],
    [144, 74],
    [136, 78],
    [120, 78],
  );
  court.marks(groundLight, [26, 73, 13], [52, 77, 10], [120, 76, 10]);
  court.marks(identityShadow, [7, 78, 16], [15, 80, 18], [36, 80, 6], [49, 82, 14], [128, 81, 16]);
  court.shape(groundBase, [1, 77], [9, 78], [15, 83], [11, 83]);
  court.shape(groundBase, [24, 77], [32, 78], [39, 82], [34, 82]);
  court.shape(groundBase, [134, 79], [139, 77], [138, 80], [127, 84], [125, 84]);
  court.stamp(-7, 63, scree);
  court.stamp(134, 64, scree);
  return court.frame;
}

export function tidalInlet() {
  const court = landscape();
  court.stamp(39, 19, wisps);
  court.bank(
    fog,
    [0, 32],
    [9, 31],
    [18, 34],
    [27, 35],
    [32, 38],
    [75, 38],
    [91, 39],
    [115, 36],
    [125, 31],
    [144, 30],
  );
  court.shape(groundShadow, [0, 33], [12, 34], [20, 37], [31, 38], [36, 40], [0, 41]);
  court.bank(groundBase, [0, 41], [144, 41]);
  court.stamp(111, 30, seaStack);
  court.stamp(135, 33, seaStack);
  court.marks(
    groundLight,
    [0, 42, 16],
    [21, 42, 7],
    [65, 42, 17],
    [92, 43, 6],
    [106, 42, 25],
    [124, 44, 8],
    [43, 45, 12],
    [77, 46, 9],
    [2, 47, 14],
    [108, 48, 13],
    [128, 50, 8],
  );
  court.marks(groundShadow, [113, 42, 14], [117, 43, 6], [136, 45, 8]);
  court.bank(
    groundBase,
    [0, 47],
    [15, 46],
    [29, 49],
    [38, 51],
    [72, 52],
    [90, 55],
    [117, 54],
    [129, 51],
    [144, 49],
  );
  court.shape(groundShadow, [0, 48], [11, 47], [28, 50], [36, 52], [17, 51], [0, 51]);
  court.stamp(1, 40, reeds);
  court.stamp(132, 41, reeds);
  courtyardFloor(court);
  court.bank(
    groundShadow,
    [0, 71],
    [12, 72],
    [25, 75],
    [52, 75],
    [68, 78],
    [95, 77],
    [107, 73],
    [124, 73],
    [144, 69],
  );
  court.bank(
    groundBase,
    [0, 75],
    [12, 76],
    [22, 79],
    [50, 78],
    [69, 81],
    [95, 80],
    [110, 76],
    [128, 76],
    [144, 73],
  );
  court.marks(
    groundLight,
    [0, 75, 7],
    [17, 78, 6],
    [36, 78, 10],
    [73, 81, 10],
    [110, 76, 9],
    [135, 74, 6],
  );
  court.marks(
    groundLight,
    [3, 80, 11],
    [18, 82, 6],
    [43, 81, 15],
    [102, 81, 10],
    [121, 78, 11],
    [134, 81, 10],
  );
  court.stamp(123, 70, dockStone);
  court.marks(groundShadow, [124, 77, 13], [126, 78, 6]);
  court.stamp(-3, 63, reeds);
  court.stamp(136, 61, reeds);
  return court.frame;
}

function courtyardFloor(court: Landscape): void {
  court.bank(groundLight, [0, 54], [26, 53], [54, 56], [69, 57], [111, 56], [132, 53], [144, 53]);
  court.shape(groundBase, [6, 59], [19, 57], [55, 57], [66, 59], [50, 61], [22, 61]);
  court.shape(
    identityBase,
    [33, 59],
    [42, 59],
    [48, 61],
    [68, 61],
    [79, 63],
    [96, 63],
    [115, 64],
    [144, 61],
    [144, 65],
    [115, 68],
    [94, 68],
    [68, 66],
    [53, 64],
    [39, 63],
  );
  court.shape(
    identityLight,
    [35, 59],
    [41, 59],
    [49, 61],
    [66, 61],
    [79, 63],
    [99, 63],
    [114, 64],
    [129, 63],
    [115, 66],
    [94, 66],
    [69, 64],
    [46, 63],
    [40, 62],
  );
  court.shape(groundBase, [85, 65], [104, 65], [110, 66], [105, 67], [87, 67], [82, 66]);
  court.marks(groundHighlight, [36, 59, 5], [43, 61, 6], [55, 62, 7], [72, 64, 5], [122, 65, 5]);
  court.marks(
    groundBase,
    [3, 65, 4],
    [13, 67, 6],
    [31, 69, 3],
    [46, 66, 4],
    [62, 73, 6],
    [114, 59, 5],
    [133, 56, 4],
  );
  court.marks(identityBase, [40, 60, 2], [51, 62, 2], [67, 63, 2], [81, 65, 3], [120, 65, 2]);
}

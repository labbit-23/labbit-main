// lib/packages.js

import { GiKidney, GiHeartBeats, GiTestTubes, GiKidneys, GiLiver, GiPill, GiBlood, GiNeckBite, GiSextant, GiBodyBalance } from "react-icons/gi";
import { MdLocalHospital, MdWc, MdImage } from "react-icons/md";

import data from "./data/health-packages.json";

export const packages = data.packages;
export const testCategoryMap = data.testCategoryMap;
export const globalNotes = data.globalNotes;


export const categoryIconMap = {
  Thyroid: <GiNeckBite />,
  Diabetes: <GiBlood />,
  Cardiac: <GiHeartBeats />,
  Liver: <GiLiver />,
  Kidney: <GiKidneys />,
  Vitamins: <GiPill />,
  Minerals: <GiTestTubes />,
  Hormones: <GiBodyBalance />,
  "Women's Health": <MdWc />,
  Imaging: <MdImage />,
  Autoimmune: <MdLocalHospital />,
  "Iron Studies": <GiTestTubes />,
  STD: <GiSextant />,
  "General Health": <MdLocalHospital />,
  Uncategorised: <MdLocalHospital />
};

export default packages;

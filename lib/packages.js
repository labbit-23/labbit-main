// lib/packages.js

const packages = [
  {
    name: "Executive Wellness Checkup",
    description: "Health check for young professionals covering key organs",
    variants: [
      {
        name: "Home Value Pack",
        parameters: 62,
        price: 1800,
        tests: [
          "CBC (Complete Blood Picture)",
          "ESR",
          "Fasting Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Serum Creatinine",
          "Thyroid Stimulating Hormone (TSH)",
          "Urinalysis"
        ]
      },
      {
        name: "Total Value Pack",
        parameters: 75,
        price: 2100,
        tests: [
          "CBC (Complete Blood Picture)",
          "ESR",
          "Fasting Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Serum Creatinine",
          "Thyroid Stimulating Hormone (TSH)",
          "Urinalysis",
          "X-Ray Chest PA View",
          "ECG - Electrocardiogram"
        ]
      }
    ]
  },
  {
    name: "Master Wellness Checkup",
    description: "In-depth full-body health evaluation with essential vitamins",
    variants: [
      {
        name: "Home Value Pack",
        parameters: 60,
        price: 3600,
        tests: [
          "CBC (Complete Blood Picture)",
          "ESR",
          "Fasting Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Renal Function Tests*",
          "Thyroid Function Tests (T3 T4 TSH)",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Serum Phosphorous",
          "Serum Calcium",
          "Urinalysis"
        ]
      },
      {
        name: "Total Value Pack",
        parameters: 72,
        price: 4700,
        tests: [
          "CBC (Complete Blood Picture)",
          "ESR",
          "Fasting Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Renal Function Tests*",
          "Thyroid Function Tests (T3 T4 TSH)",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Serum Phosphorous",
          "Serum Calcium",
          "Urinalysis",
          "Ultrasound Scan of Abdomen (& Pelvis)",
          "X-Ray Chest PA View",
          "ECG"
        ]
      }
    ]
  },
  {
    name: "Specialised Wellness Checkup",
    description: "Advanced health check with cardiac & hormonal checks",
    variants: [
      {
        name: "Specialised Male",
        parameters: 80,
        price: 6900,
        tests: [
          "CBC (Complete Blood Picture)",
          "ESR",
          "Fasting Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Renal Function Tests*",
          "Thyroid Function Tests (T3 T4 TSH)",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Serum Phosphorous",
          "Serum Calcium",
          "Insulin Resistance - Fasting (HOMA)",
          "Magnesium",
          "Cortisol (Stress Hormone)",
          "Prostate Specific Antigen - PSA",
          "Urinalysis",
          "2-D Echo Color Doppler",
          "Ultrasound Scan of Abdomen",
          "X-Ray Chest PA View",
          "ECG"
        ]
      },
      {
        name: "Specialised Female",
        parameters: 82,
        price: 6900,
        tests: [
          "CBC (Complete Blood Picture)",
          "ESR",
          "Fasting Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Renal Function Tests*",
          "Thyroid Function Tests (T3 T4 TSH)",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Serum Phosphorous",
          "Serum Calcium",
          "Insulin Resistance - Fasting (HOMA)",
          "Magnesium",
          "Cortisol (Stress Hormone)",
          "PAP Smear",
          "RA Factor",
          "Urinalysis",
          "2-D Echo Color Doppler",
          "Ultrasound Scan of Abdomen",
          "X-Ray Chest PA View",
          "ECG"
        ]
      }
    ]
  },
  {
    name: "Stress Wellness Checkup",
    description: "Focused package to evaluate stress-related health parameters.",
    variants: [
      {
        name: "Stress Profile",
        parameters: 36,
        price: 2345,
        tests: [
          "CBC (Complete Blood Picture)",
          "Lipid Profile*",
          "Thyroid Stimulating Hormone (TSH)",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Cortisol (Stress Hormone)",
          "X-Ray Chest PA View",
          "ECG"
        ]
      }
    ]
  },
  {
    name: "Fitness Profile",
    description: "Ideal for athletes and fitness enthusiasts.",
    variants: [
      {
        name: "Fitness Basic",
        parameters: 32,
        price: 4300,
        tests: [
          "CBC (Complete Blood Picture)",
          "Fasting Blood Glucose",
          "HbA1c",
          "Lipid Profile*",
          "Liver Function Tests*",
          "Creatinine",
          "Urea",
          "Electrolytes",
          "Iron, Total Iron Binding Capacity",
          "Calcium",
          "Magnesium",
          "Urine Protein Creatinine Ratio",
          "Cortisol - Stress Hormone",
          "Insulin Resistance - Fasting (HOMA)",
          "CPK - Creatinine Kinase",
          "Testosterone",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Urinalysis"
        ]
      }
    ]
  },
  {
    name: "Hair Fall Profile",
    description: "Investigates nutritional deficiencies and causes of hair loss.",
    variants: [
      {
        name: "Hair Fall Basic",
        parameters: 32,
        price: 3900,
        tests: [
          "CBC (Complete Blood Count)",
          "Iron, Total Iron Binding Capacity",
          "Ferritin",
          "Vitamin D (25-OH)",
          "Vitamin B12",
          "Thyroid Function Tests (T3 T4 TSH)",
          "Calcium"
        ]
      }
    ]
  },
  {
    name: "Diabetic Profile",
    description: "Focused for managing & monitoring diabetes complications",
    variants: [
      {
        name: "Diabetic Basic",
        parameters: 65,
        price: 3100,
        tests: [
          "Fasting Blood Sugar",
          "Post Prandial Blood Sugar",
          "HbA1c",
          "Lipid Profile*",
          "Thyroid Stimulating Hormone (TSH)",
          "Renal Function Tests*",
          "Urine Microalbumin Creatinine Ratio",
          "CBC (Complete Blood Picture)",
          "ESR",
          "AST, ALT",
          "Urinalysis",
          "ECG"
        ]
      }
    ]
  },
  {
    name: "Cardiac Wellness",
    description: "In-depth evaluation of cardiac health.",
    variants: [
      {
        name: "Cardiac Basic",
        parameters: 38,
        price: 3100,
        tests: [
          "Lipid Profile",
          "CBC (Complete Blood Picture)",
          "ESR",
          "2D Echo Color Doppler",
          "X-Ray Chest PA View",
          "Fasting Blood Sugar",
          "ECG",
          "Creatinine",
          "CPK Total",
          "Electrolytes",
          "Urinalysis"
        ]
      },
      {
        name: "Cardiac Comprehensive",
        parameters: 50,
        price: 5500,
        tests: [
          "Lipid Profile",
          "High Sensitive CRP",
          "Homocystine",
          "CBC (Complete Blood Picture)",
          "ESR",
          "2D Echo Color Doppler",
          "Treadmill Test",
          "X-Ray Chest PA View",
          "Fasting Blood Sugar",
          "ECG",
          "Creatinine",
          "CPK Total",
          "CPK-MB",
          "Electrolytes",
          "AST, ALT",
          "Urinalysis"
        ]
      }
    ]
  },
  {
    name: "Women's Health Checkup",
    description: "Specially curated for women’s preventive care.",
    variants: [
      {
        name: "Women's Basic",
        parameters: 60,
        price: 3800,
        tests: [
          "CBC (Complete Blood Count)",
          "ESR",
          "Random Blood Sugar",
          "Cholesterol",
          "Creatinine",
          "Calcium",
          "Electrolytes",
          "Thyroid Stimulating Hormone (TSH)",
          "Liver Function Tests*",
          "RA Factor",
          "Urinalysis",
          "ECG",
          "Ultrasound scan of Breasts",
          "Ultrasound scan of Pelvis and Abdomen"
        ]
      },
      {
        name: "Women's Comprehensive",
        parameters: 75,
        price: 8500,
        tests: [
          "CBC (Complete Blood Count)",
          "ESR",
          "Fasting Blood Sugar",
          "Post-Prandial Blood Sugar",
          "Hba1c",
          "Lipid Profile",
          "Creatinine",
          "Calcium",
          "Electrolytes",
          "Thyroid Function Tests (T3 T4 TSH)",
          "CA-125",
          "Vitamin D",
          "Vitamin B12",
          "Liver Function Tests*",
          "RA Factor",
          "PAP Smear",
          "Urinalysis",
          "ECG",
          "X-Ray Chest PA View",
          "Ultrasound scan of Breasts",
          "Ultrasound scan of Pelvis and Abdomen",
          "DEXA Bone Densitometry OR Mammography"
        ]
      }
    ]
  },
  {
    name: "STD Screening Package",
    description: "Screening for common sexually transmitted diseases.",
    variants: [
      {
        name: "STD Basic",
        parameters: 5,
        price: 1500,
        tests: [
          "HIV 1/2 Antibody & Antigen",
          "Hepatitis B Surface Antigen",
          "Hepatitis C Antibody",
          "VDRL (Syphilis)",
          "TPHA"
        ]
      },
      {
        name: "STD Advanced",
        parameters: 7,
        price: 4400,
        tests: [
          "HIV 1/2 Antibody & Antigen",
          "Hepatitis B Surface Antigen",
          "Hepatitis C Antibody",
          "VDRL (Syphilis)",
          "TPHA",
          "Chlamydia IgM",
          "Herpes Simplex Virus (HSV) IgG IgM"
        ]
      }
    ]
  }
];

export const globalNotes = [
  "*Lipid Profile: Cholesterol Total - Serum, Triglycerides, HDL Cholesterol, LDL Cholesterol, VLDL Cholesterol, CHOL / HDL Ratio, HDL/LDL Cholesterol Ratio",
  "*Liver Function Tests (LFT): Total Bilirubin, Direct Bilirubin, Indirect Bilirubin, Aspartate Aminotransferase (AST)(SGOT), Alanine Transaminase (ALT)(SGPT), Alkaline Phosphatase (ALP), GGT, Total Protein, Albumin, Globuline, A/G Ratio",
  "*Electrolytes: Sodium - Serum, Potassium - Serum, Chloride - Serum",
  "*Renal Function Tests: Serum Creatinine, eGFR, Serum Urea, BUN, Serum Electrolytes (Sodium, Potassium, Chlorides), Serum Uric Acid"
];

export default packages;


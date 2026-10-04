/* Institution data imported from the Google Sheet "TG398 LPCH Ver 20260924"
 * (sheets "0. List" and "1. kQ,Q0 table"). Units: N_D,w in cGy/nC, zmax in g/cm²,
 * TMR and electron PDD(z_ref) as fractions. null = blank cell in the sheet.
 * Regenerate from the sheet when it changes. */
window.LPCH_DATA = {
 "source": "TG398 LPCH Ver 20260924 (Google Sheet)",
 "accelerators": [
  { "name": "Infinity-6023",
   "photon": [
    {"energy": "6 MV", "zmax": 1.5, "tmr": 0.81},
    {"energy": "10 MV", "zmax": 2.3, "tmr": 0.875},
    {"energy": "6 MV FFF", "zmax": 1.5, "tmr": null}
   ],
   "electron": [
    {"energy": "6 MeV", "r50": 2.615, "zmax": 1.49, "ndw": 7.995, "pdd": 1.0, "kcross": 1.0},
    {"energy": "9 MeV", "r50": 3.744, "zmax": 2.101, "ndw": 7.908, "pdd": 1.0, "kcross": 1.0},
    {"energy": "12 MeV", "r50": 4.854, "zmax": 2.7, "ndw": 7.809, "pdd": 1.0, "kcross": 1.0},
    {"energy": "15 MeV", "r50": 6.103, "zmax": 2.7, "ndw": 7.747, "pdd": 0.99, "kcross": 1.0},
    {"energy": "18 MeV", "r50": 7.315, "zmax": 3.0, "ndw": 7.668, "pdd": 0.986, "kcross": 1.0}
   ]
  },
  { "name": "Precise2-3461",
   "photon": [
    {"energy": "6 MV", "zmax": 1.5, "tmr": 0.794},
    {"energy": "10 MV", "zmax": 2.3, "tmr": 0.846}
   ],
   "electron": []
  },
  { "name": "VersaHD-4406",
   "photon": [
    {"energy": "6 MV", "zmax": 1.8, "tmr": 0.803},
    {"energy": "10 MV", "zmax": 2.3, "tmr": 0.862},
    {"energy": "6 MV FFF", "zmax": null, "tmr": 0.803}
   ],
   "electron": [
    {"energy": "6 MeV", "r50": 2.5, "zmax": null, "ndw": 7.995, "pdd": 1.0, "kcross": 1.0},
    {"energy": "9 MeV", "r50": 3.65, "zmax": null, "ndw": 7.908, "pdd": 0.998, "kcross": 1.0},
    {"energy": "12 MeV", "r50": 4.76, "zmax": null, "ndw": 7.809, "pdd": 1.0, "kcross": 1.0}
   ]
  }
 ],
 "chambers": [
  {"name": "Farmer TW30013 s/n 0458", "ndw": 5.307, "type": "cyl"},
  {"name": "Farmer TW30013 s/n 9849", "ndw": 5.338, "type": "cyl"},
  {"name": "PP TW34001 s/n 1208", "ndw": 1.0, "type": "pp"}
 ],
 "electrometers": ["PTW Webline s/n 2103"],
 "kqPhoton": { "qLabel": "TPR20,10",
  "grid": [0.5, 0.53, 0.56, 0.59, 0.62, 0.65, 0.68, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.82, 0.84],
  "chambers": [
   {"name": "TW10003", "kq": [1.002, 1.002, 1.0, 0.999, 0.997, 0.994, 0.99, 0.988, 0.984, 0.98, 0.975, 0.968, 0.96, 0.952, 0.94]}
  ]
 },
 "kqElectron": { "qLabel": "R50",
  "grid": [1.0, 1.4, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 10.0, 13.0, 16.0, 20.0],
  "chambers": [
   {"name": "Roos", "kq": [0.965, 0.955, 0.944, 0.937, 0.931, 0.925, 0.92, 0.916, 0.912, 0.908, 0.904, 0.898, 0.892, 0.882, 0.87, 0.86, 0.848]}
  ]
 }
};

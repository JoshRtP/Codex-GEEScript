/**
 * diag_ndti_field68250.js
 *
 * Diagnostic script: prints raw NDTI (and supporting bands) for field 68250
 * across every fall and spring window from 2020-2024 so you can verify the
 * classification numbers match what field_analytics_v2.js computes.
 *
 * Paste into GEE Code Editor and click Run.  Results appear in the Console.
 * No UI / no panels – pure inspection.
 *
 * NDTI = (B11 - B8) / (B11 + B8)
 *   > 0.20      residue present  → expect reduced / no-till
 *     0.00–0.20  some residue
 *   < 0.00      bare / tilled   → expect intensive till
 */

// ── Config ────────────────────────────────────────────────────────────────────
var FIELD_ASSET = 'projects/gen-lang-client-0499108456/assets/FieldMask_5070';
var TARGET_PID  = 68250;
var PROXY_YEARS = [2020, 2021, 2022, 2023, 2024];

var FALL_START   = '09-01';
var FALL_END     = '11-30';
var SPRING_START = '02-01';
var SPRING_END   = '05-15';

// Sentinel-2 cloud filter – same default as v2 (30 %)
var MAX_CLOUD_PCT = 30;

// ── Load the single field ────────────────────────────────────────────────────
// Mirror the choosePolyId() logic from field_analytics_v2.js:
// the raw asset has no 'poly_id' — it lives under field_id / Field_ID / ID / id
// or (if none of those exist) the system feature id.
var raw = ee.FeatureCollection(FIELD_ASSET);

function choosePolyId(f){
  var names = f.propertyNames();
  var pid = ee.Algorithms.If(names.contains('field_id'), f.get('field_id'),
            ee.Algorithms.If(names.contains('Field_ID'),  f.get('Field_ID'),
            ee.Algorithms.If(names.contains('ID'),        f.get('ID'),
            ee.Algorithms.If(names.contains('id'),        f.get('id'),
            f.id()))));
  return ee.String(pid);
}

// Map poly_id onto the raw collection (same as the main script), then filter.
var fields = raw.map(function(f){
  return f.set('poly_id', choosePolyId(f));
});
var targetFC = fields.filter(
  ee.Filter.or(
    ee.Filter.eq('poly_id', TARGET_PID),
    ee.Filter.eq('poly_id', String(TARGET_PID))
  )
);
var geom = targetFC.geometry();

// ── Diagnostic: print properties and confirm match ───────────────────────────
raw.first().propertyNames().evaluate(function(names){
  print('Asset property names (raw):', names);
});
targetFC.size().evaluate(function(n){
  if (n === 0){
    print('WARNING: No feature matched poly_id =', TARGET_PID +
          '. Showing 3 raw features to verify property names/values:');
    raw.limit(3).evaluate(function(fc){ print(fc); });
  } else {
    print('Found', n, 'feature(s) with poly_id =', TARGET_PID, '✓');
  }
});

// Centre map and highlight the field
Map.centerObject(geom, 15);
Map.addLayer(targetFC.style({color:'cyan', width:2, fillColor:'00000000'}), {}, 'Field ' + TARGET_PID);

// ── Index helpers ────────────────────────────────────────────────────────────
function maskS2(img){
  var scl = img.select('SCL');
  var bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
              .or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10));
  return img.updateMask(bad.not());
}

function addIndices(img){
  var nir  = img.select('B8');
  var red  = img.select('B4');
  var blue = img.select('B2');
  var sw1  = img.select('B11');
  var sw2  = img.select('B12');
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  var ndti = sw1.subtract(nir).divide(sw1.add(nir)).rename('NDTI');   // (B11-B8)/(B11+B8)
  var bsi  = sw1.add(red).subtract(nir.add(blue))
               .divide(sw1.add(red).add(nir.add(blue))).rename('BSI');
  var ndmi = nir.subtract(sw1).divide(nir.add(sw1)).rename('NDMI');
  var bare = ndvi.lt(0.25).and(ndmi.lt(0.10)).rename('bare_frac');
  return img.addBands([ndvi, ndti, bsi, ndmi, bare]);
}

/**
 * Returns a median composite clipped to geom for a given year + MM-DD window.
 * Prints the image count used so you can judge data availability.
 */
function seasonalStats(year, mmddStart, mmddEnd, label){
  var yearStr = ee.Number(year).int().format();
  var start = ee.Date.parse('YYYY-MM-dd', yearStr.cat('-').cat(mmddStart));
  var end   = ee.Date.parse('YYYY-MM-dd', yearStr.cat('-').cat(mmddEnd)).advance(1, 'day');

  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', MAX_CLOUD_PCT))
    .map(maskS2)
    .map(addIndices);

  var n    = col.size();
  var med  = ee.Image(ee.Algorithms.If(
    n.gt(0),
    col.median().clip(geom),
    ee.Image.constant([0,0,0,0,0])
      .rename(['NDVI','NDTI','BSI','NDMI','bare_frac'])
      .clip(geom)
  ));

  var stats = med.select(['NDVI','NDTI','BSI','NDMI','bare_frac'])
    .reduceRegion({
      reducer: ee.Reducer.mean()
        .combine(ee.Reducer.stdDev(), '', true)
        .combine(ee.Reducer.min(),    '', true)
        .combine(ee.Reducer.max(),    '', true),
      geometry: geom,
      scale: 10,
      maxPixels: 1e8
    });

  // Bundle for printing
  var out = ee.Dictionary({
    label      : label,
    year       : year,
    imageCount : n,
    NDVI_mean  : stats.get('NDVI_mean'),
    NDTI_mean  : stats.get('NDTI_mean'),
    NDTI_min   : stats.get('NDTI_min'),
    NDTI_max   : stats.get('NDTI_max'),
    NDTI_stdDev: stats.get('NDTI_stdDev'),
    BSI_mean   : stats.get('BSI_mean'),
    NDMI_mean  : stats.get('NDMI_mean'),
    bare_frac  : stats.get('bare_frac_mean')
  });

  return {stats: out, med: med, n: n};
}

// ── Run over all years ────────────────────────────────────────────────────────
print('=== NDTI Diagnostic — Field', TARGET_PID, '===');
print('NDTI = (B11 - B8) / (B11 + B8)');
print('Expected for NO tillage event (2024): NDTI_mean > 0.10 (residue present)');
print('Expected for tilled field: NDTI_mean < 0.00');
print('──────────────────────────────────────────');

PROXY_YEARS.forEach(function(yr){
  var fall   = seasonalStats(yr,   FALL_START,   FALL_END,   'FALL');
  var spring = seasonalStats(yr+1, SPRING_START, SPRING_END, 'SPRING');

  // Print fall result
  fall.stats.evaluate(function(d){
    if (!d){ print('▶ ' + yr + ' FALL  — no data (check field filter / cloud cover)'); return; }
    print('▶ ' + yr + ' FALL  (' + FALL_START + '→' + FALL_END + ')  images=' + d.imageCount,
          '  NDVI=' + num(d.NDVI_mean) +
          '  NDTI=' + num(d.NDTI_mean) + ' [' + num(d.NDTI_min) + ',' + num(d.NDTI_max) + ']' +
          '  BSI=' + num(d.BSI_mean) +
          '  bare_frac=' + num(d.bare_frac));
  });

  // Print spring result
  spring.stats.evaluate(function(d){
    if (!d){ print('▶ ' + yr + ' SPRING — no data (check field filter / cloud cover)'); return; }
    print('▶ ' + yr + ' SPRING(' + SPRING_START + '→' + SPRING_END + ')  images=' + d.imageCount,
          '  NDVI=' + num(d.NDVI_mean) +
          '  NDTI=' + num(d.NDTI_mean) + ' [' + num(d.NDTI_min) + ',' + num(d.NDTI_max) + ']' +
          '  BSI=' + num(d.BSI_mean) +
          '  bare_frac=' + num(d.bare_frac));

    // 2024 spring: replicate the CORRECTED v2 proxy formula
    if (yr === 2024){
      // NOTE: bare_frac ≈ 0.97 for nearly all Midwest fields in Feb-May — crops haven't
      // emerged yet.  It cannot tell tilled from residue-covered, so the OLD formula
      // (NDTI - bare_frac) was always ≈ -0.75 regardless of management.
      // NEW formula: normalise NDTI to [0=tilled, 1=residue], gate by bare_frac.
      var ndtiNorm = Math.min(1, Math.max(0, (d.NDTI_mean - (-0.2)) / (0.4 - (-0.2))));
      var reduced   = ndtiNorm * d.bare_frac;
      var intensive = (1 - ndtiNorm) * d.bare_frac;
      var margin    = reduced - intensive;

      print('  ── 2024 Proxy Scores (NDTI-normalised formula) ──');
      print('  ndti_norm = (NDTI+0.2)/0.6 clamped [0,1] = ' + num(ndtiNorm));
      print('  reduced_till_proxy   = ndti_norm × bare_frac   = ' + num(reduced));
      print('  intensive_till_proxy = (1-ndti_norm) × bare_frac = ' + num(intensive));
      print('  margin (reduced-intensive)                       = ' + num(margin));
      if      (margin >  0.15) { print('  → Classification: LIKELY REDUCED TILL ✓'); }
      else if (margin < -0.15) { print('  → Classification: LIKELY INTENSIVE TILL'); }
      else                     { print('  → Classification: UNCERTAIN'); }

      print('  ── Cover Crop Check (spring NDVI) ──');
      print('  spring NDVI_mean = ' + num(d.NDVI_mean) + '  threshold = 0.35');
      if (d.NDVI_mean >= 0.35) { print('  → Cover crop LIKELY (spring NDVI above threshold)'); }
      else                     { print('  → Cover crop UNLIKELY on spring NDVI alone (check fall)'); }
    }
  });

  // Add spring composite to map for 2024 so you can visually inspect
  if (yr === 2024){
    Map.addLayer(spring.med.select('NDTI'),
      {min:-0.2, max:0.4, palette:['#d73027','#fee090','#e0f3f8','#74add1','#313695']},
      '2024 Spring NDTI (red=tilled, blue=residue)', true);
    Map.addLayer(fall.med.select('NDVI'),
      {min:0.1, max:0.7, palette:['#ffffcc','#78c679','#005a32']},
      '2024 Fall NDVI', false);
  }
});

// ── Helper: format to 4 dp ────────────────────────────────────────────────────
function num(v){ return v === null || v === undefined ? 'null' : (+v).toFixed(4); }

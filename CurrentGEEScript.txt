/*******************************************************
 * Field Analytics — ON-DEMAND (S2 + optional S1 + MODIS)
 * + STATIC COVARIATES (Terrain + DAYMET + POLARIS + SoilGrids + gNATSGO SOC)
 * - No CSV export: covariates computed on click and shown in popup
 * - CURRENT ISSUE EXIST WITH DIFFERENT SOC COVARIATES AND UNITS ARE STILL UNKNOWN
 *******************************************************/

/* ---------- USER ASSETS ---------- */
var FIELD_ASSET = 'projects/gen-lang-client-0499108456/assets/FieldMask_5070';
// Optional: USDA Crop Sequence Boundaries or County Boundaries asset (leave '' to disable)
var CSB_ASSET   = 'TIGER/2018/Counties'; // Built-in US Counties with FIPS codes

/* ---------- GLOBALS ---------- */
Map.setOptions('SATELLITE');

var state = {
  s2Base: null,
  s1Base: null,
  allWeeksWithScenes: [],
  refinedWeeks: [],
  lastGeom: null,
  lastPid: null,
  contactSheetPopup: null
};

/* ---------- CDL overlay (latest) + helpers ---------- */
var CDL_FIRST = 2008;
var CDL_LAST  = 2024; // update when newer year is available
function cdlImage(year){ return ee.Image('USDA/NASS/CDL/' + year).select('cropland'); }
function cdlLegendDict(){
  return {
    '1': 'Corn','2': 'Cotton','3': 'Rice','4': 'Sorghum','5': 'Soybeans','6': 'Sunflower',
    '10': 'Peanuts','11': 'Tobacco','12': 'Sweet Corn','13': 'Pop or Orn Corn','14': 'Mint',
    '21': 'Barley','22': 'Durum Wheat','23': 'Spring Wheat','24': 'Winter Wheat','25': 'Other Small Grains',
    '26': 'Dbl Crop WinWht/Soybeans','27': 'Rye','28': 'Oats','29': 'Millet','30': 'Speltz',
    '31': 'Canola','32': 'Flaxseed','33': 'Safflower','34': 'Rape Seed','35': 'Mustard',
    '36': 'Alfalfa','37': 'Other Hay/Non Alfalfa','38': 'Camelina','39': 'Buckwheat',
    '41': 'Sugarbeets','42': 'Dry Beans','43': 'Potatoes','44': 'Other Crops','45': 'Sugarcane',
    '46': 'Sweet Potatoes','47': 'Misc Vegs & Fruits','48': 'Watermelons','49': 'Onions','50': 'Cucumbers',
    '51': 'Chick Peas','52': 'Lentils','53': 'Peas','54': 'Tomatoes','55': 'Caneberries','56': 'Hops',
    '57': 'Herbs','58': 'Clover/Wildflowers','59': 'Sod/Grass Seed','60': 'Switchgrass','61': 'Fallow/Idle Cropland',
    '63': 'Forest','64': 'Shrubland','65': 'Barren','81': 'Clouds/No Data','82': 'Developed','83': 'Water',
    '87': 'Wetlands','88': 'Nonag/Undefined','92': 'Aquaculture','111': 'Open Water','112': 'Perennial Ice/Snow',
    '121': 'Developed/Open Space','122': 'Developed/Low Intensity','123': 'Developed/Med Intensity','124': 'Developed/High Intensity',
    '131': 'Barren Land','141': 'Deciduous Forest','142': 'Evergreen Forest','143': 'Mixed Forest','152': 'Shrubland',
    '176': 'Grassland/Pasture','190': 'Woody Wetlands','195': 'Herbaceous Wetlands'
  };
}

/* ---------- UI ---------- */
var uiPanel = ui.Panel({style:{width:'800px'}});
ui.root.insert(0, uiPanel);
uiPanel.add(ui.Label('Field Analytics — On-Demand (S2 + S1 + MODIS + CDL) + Covariates', {
  fontWeight:'bold', fontSize:'16px'
}));

var startBox   = ui.Textbox({placeholder:'YYYY-MM-DD', value:'2025-02-01', style:{width:'140px'}});
var endBox     = ui.Textbox({placeholder:'YYYY-MM-DD', value:'2025-07-01', style:{width:'140px'}});
var cloudSlide = ui.Slider({min:0,max:100,value:90,step:1,style:{stretch:'horizontal'}});
var sarToggle  = ui.Checkbox({label:'Include Sentinel-1 SAR (VV, VH, VH/VV)', value:false});
var minValidPct= ui.Slider({min:0,max:100,value:20,step:5,style:{width:'160px'}});
var maskMode   = ui.Select({items:['Strict','Standard','Relaxed','Very relaxed'], value:'Standard'});

uiPanel.add(ui.Label('Date range'));
uiPanel.add(ui.Panel(
  [ui.Label('Start'), startBox, ui.Label('End'), endBox],
  ui.Panel.Layout.flow('horizontal'),
  {stretch:'horizontal', margin:'4px 0'}
));

/* Field search controls */
var searchRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
var searchBox = ui.Textbox({placeholder:'Enter poly_id (e.g., 69005)', style:{width:'200px'}});
var searchBtn = ui.Button({label:'Find Field', style:{color:'blue'}});
searchRow.add(ui.Label('Search:')).add(searchBox).add(searchBtn);
uiPanel.add(searchRow);

/* Contact sheet controls */
var sheetRow  = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
var sheetIdx  = ui.Select({items:['NDVI','EVI','NAIP','ALL'], value:'NDVI'});
var naipMaxAgeDays = 365;
var lsMaxDeltaDays = 45;
var sheetN    = ui.Slider({min:6,max:52,value:24,step:1,style:{width:'160px'}});
var showSheet = ui.Button({label:'Visual Timeline'});
var hideInvalid = ui.Checkbox({label:'Hide invalid S2 weeks', value:false});
sheetRow.add(ui.Label('Index')).add(sheetIdx).add(ui.Label('Frames')).add(sheetN).add(showSheet);
uiPanel.add(sheetRow);
uiPanel.add(hideInvalid);

// Run / Update
var runBtn = ui.Button({label:'Run / Update', style:{stretch:'horizontal'}});
uiPanel.add(runBtn);
var statusLabel = ui.Label('Ready. Click “Run / Update”.', {color:'#666'});
uiPanel.add(statusLabel);

// Advanced options (collapsible)
var advExpanded = false;
var advToggle = ui.Button({label: 'Advanced options ▸', style:{color:'#444'}});
var advPanel = ui.Panel({layout: ui.Panel.Layout.flow('vertical')});
advPanel.style().set('shown', false);
advToggle.onClick(function(){
  advExpanded = !advExpanded;
  advPanel.style().set('shown', advExpanded);
  advToggle.setLabel(advExpanded ? 'Advanced options ▾' : 'Advanced options ▸');
});
advPanel.add(ui.Label('S2 CLOUDY_PIXEL_PERCENTAGE ≤'));
advPanel.add(cloudSlide);
advPanel.add(sarToggle);
advPanel.add(ui.Panel(
  [ui.Label('Min valid pixels in field (%)'), minValidPct],
  ui.Panel.Layout.flow('horizontal')
));
advPanel.add(ui.Panel([ui.Label('Mask mode'), maskMode], ui.Panel.Layout.flow('horizontal')));

// Overlay controls
var overlayRow   = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
var weekSelect   = ui.Select({items:[], placeholder:'Pick a week'});
var indexSelect  = ui.Select({items:['NDVI','EVI','Both'], value:'Both'});
var alphaSlider  = ui.Slider({min:0,max:1,value:0.8,step:0.05,style:{width:'120px'}});
overlayRow.add(ui.Label('Week')).add(weekSelect)
          .add(ui.Label('Index')).add(indexSelect)
          .add(ui.Label('Opacity')).add(alphaSlider);
uiPanel.add(overlayRow);

var addOverlayBtn   = ui.Button({label:'Add overlay to map'});
var clearOverlayBtn = ui.Button({label:'Clear overlays (keep fields)'});
var baseDimSlider   = ui.Slider({min:0,max:1,value:0.3,step:0.05,style:{width:'120px'}});
uiPanel.add(ui.Panel([addOverlayBtn, clearOverlayBtn], ui.Panel.Layout.flow('horizontal')));
advPanel.add(ui.Panel([ui.Label('Basemap dim'), baseDimSlider], ui.Panel.Layout.flow('horizontal')));

// UI width control (Advanced)
var uiWidthSlider = ui.Slider({min:600, max:1200, value:800, step:20, style:{width:'220px'}});
uiWidthSlider.onChange(function(v){ uiPanel.style().set('width', v + 'px'); });
advPanel.add(ui.Panel([ui.Label('UI width (px)'), uiWidthSlider], ui.Panel.Layout.flow('horizontal')));

/* Photo overlay controls */
var photoSourceSel = ui.Select({
  items: ['S2 → NAIP → Landsat', 'NAIP → Landsat', 'Landsat → NAIP'],
  value: 'S2 → NAIP → Landsat',
  style: {width: '220px'}
});
var photoBtn = ui.Button({label:'Add Photo Overlay', style:{color:'#0b7285'}});
var photoRow = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
photoRow.add(ui.Label('Photo source order')).add(photoSourceSel).add(photoBtn);
advPanel.add(photoRow);

function updateWeekSelect(items, selectedValue) {
  var widgets = overlayRow.widgets();
  for (var i = 0; i < widgets.length(); i++) {
    var widget = widgets.get(i);
    if (widget === weekSelect) { overlayRow.remove(widget); break; }
  }
  weekSelect = ui.Select({items: items || [], value: selectedValue, placeholder: 'Pick a week'});
  overlayRow.insert(1, weekSelect);
}

/* ---------- Fields (with optional CSBID) ---------- */
function choosePolyId(f){
  var names = f.propertyNames();
  var pid = ee.Algorithms.If(names.contains('field_id'), f.get('field_id'),
           ee.Algorithms.If(names.contains('Field_ID'),  f.get('Field_ID'),
           ee.Algorithms.If(names.contains('ID'),        f.get('ID'),
           ee.Algorithms.If(names.contains('id'),        f.get('id'),
           f.id()))));
  return ee.String(pid);
}

var fields = ee.FeatureCollection(FIELD_ASSET)
  .map(function(f){ return f.set('poly_id', choosePolyId(f)); });

if (CSB_ASSET && CSB_ASSET.length > 0) {
  var csb = ee.FeatureCollection(CSB_ASSET);
  fields = fields.map(function(f){
    var hit = csb.filterBounds(f.geometry()).first();
    return ee.Feature(ee.Algorithms.If(
      hit,
      ee.Feature(f).set('CSBID', ee.Feature(hit).get('CSBID')),
      f
    ));
  });
}

Map.centerObject(fields, 13);
Map.addLayer(fields.style({color:'cyan', width:2, fillColor:'00000000'}), {}, 'Fields');

/* ---------- Helpers ---------- */
function validateDateRange(start, end) {
  try {
    var s = ee.Date(start); var e = ee.Date(end);
    var ok = e.difference(s,'day').gt(0);
    return {valid: ok, s: s, e: e};
  } catch (err) {
    return {valid: false};
  }
}
function weeklySequence(start, end){
  var s = ee.Date(start), e = ee.Date(end);
  var days = e.difference(s,'day');
  var weeks = days.divide(7).floor().max(1);
  return ee.List.sequence(0, weeks.subtract(1))
           .map(function(i){ return s.advance(ee.Number(i).multiply(7),'day'); });
}
function maskS2clouds(img){
  var scl = img.select('SCL');
  var mode = maskMode.getValue();
  var bad = null;
  if (mode === 'Strict') {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
      .or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10)).or(scl.eq(11));
  } else if (mode === 'Standard') {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
      .or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10));
  } else if (mode === 'Relaxed') {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
      .or(scl.eq(9)).or(scl.eq(10));
  } else {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2))
      .or(scl.eq(9));
  }
  return img.updateMask(bad.not());
}
function addIndices(img){
  var nir=img.select('B8'), red=img.select('B4'), blue=img.select('B2'), sw1=img.select('B11');
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  var evi  = nir.subtract(red).multiply(2.5)
               .divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)).rename('EVI');
  var bsi  = sw1.add(red).subtract(nir.add(blue))
               .divide(sw1.add(red).add(nir.add(blue))).rename('BSI');
  return img.addBands([ndvi,evi,bsi]);
}
function emptyBands(names){
  var z = ee.Image.constant(ee.List.repeat(0, names.length)).toFloat().rename(names);
  return z.updateMask(ee.Image.constant(0));
}

function composeWeek(ws){
  var we  = ee.Date(ws).advance(1,'week');
  var raw = state.s2Base.filterDate(ws, we).select(['B2','B4','B8','B11']);
  var med = ee.Image(ee.Algorithms.If(raw.size().gt(0), raw.median(), emptyBands(['B2','B4','B8','B11'])));
  var out = addIndices(med).select(['NDVI','EVI','BSI']).clipToCollection(fields);

  if (state.s1Base) {
    var s1w = state.s1Base.filterDate(ws, we);
    var s1m = ee.Image(ee.Algorithms.If(s1w.size().gt(0), s1w.median().select(['VV','VH']), emptyBands(['VV','VH'])));
    function toDb(x){ return x.max(1e-6).log10().multiply(10); }
    out = out.addBands(toDb(s1m.select('VV')).rename('VV_dB'))
             .addBands(toDb(s1m.select('VH')).rename('VH_dB'))
             .addBands(s1m.select('VH').divide(s1m.select('VV').max(1e-6)).rename('VH_VV'));
  }
  return out.set('week_start', ee.Date(ws).format('YYYY-MM_dd'));
}

// Fraction of valid pixels for a week inside a geometry (0..1).
// Uses the composed NDVI mask as the validity proxy (same behavior as the original timeline script).
function validFrac(ws, geom, scale){
  var nd = composeWeek(ws).select('NDVI'); // any index’s mask works
  var v  = nd.mask().gt(0).rename('v');
  return ee.Number(v.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: scale || 20, tileScale:8,
    bestEffort:true, maxPixels: 2e9
  }).get('v'));
}



/* ======================================================================================
 *  STATIC COVARIATES (Terrain + DAYMET + POLARIS + SoilGrids + gNATSGO SOC)
 * ====================================================================================== */

/* ---------- Covariates UI (Advanced) ---------- */
var covYearBox = ui.Textbox({value: '2024', style:{width:'80px'}});
var soilDepthSel = ui.Select({
  items: ['0-5','5-15','15-30','30-60','60-100','100-200'],
  value: '15-30',
  style:{width:'90px'}
});
advPanel.add(ui.Label('Covariates'));
advPanel.add(ui.Panel(
  [ui.Label('DAYMET year'), covYearBox, ui.Label('Depth (cm)'), soilDepthSel],
  ui.Panel.Layout.flow('horizontal')
));

/* ---------- Covariate image builders ---------- */
function terrainStack(){
  var dem = ee.Image('USGS/3DEP/10m').select('elevation').rename('dem_m');
  var slope = ee.Terrain.slope(dem).rename('slope_deg');
  var aspect = ee.Terrain.aspect(dem).rename('aspect_deg');
  var hillshade = ee.Terrain.hillshade(dem).rename('hillshade');
  return dem.addBands([slope, aspect, hillshade]);
}

function daymetStackSafe(yearStr){
  var y = ee.Number.parse(yearStr);

  function stackForYear(yearNum){
    var daily = ee.ImageCollection('NASA/ORNL/DAYMET_V4')
      .filter(ee.Filter.calendarRange(yearNum, yearNum, 'year'));
    var tminMean = daily.select('tmin').mean().rename('daymet_tmin_mean_C');
    var tmaxMean = daily.select('tmax').mean().rename('daymet_tmax_mean_C');
    var prcpSum  = daily.select('prcp').sum().rename('daymet_prcp_sum_mm');
    var meanTemp = tminMean.add(tmaxMean).rename('daymet_mean_temperature');
    return ee.Image.cat([tminMean, tmaxMean, meanTemp, prcpSum])
      .set('daymet_year_used', yearNum)
      .set('daymet_n_images', daily.size());
  }

  var s0 = stackForYear(y);
  var s1 = stackForYear(y.subtract(1));
  var s2 = stackForYear(y.subtract(2));

  return ee.Image(ee.Algorithms.If(
    ee.Number(s0.get('daymet_n_images')).gt(0), s0,
    ee.Algorithms.If(ee.Number(s1.get('daymet_n_images')).gt(0), s1, s2)
  ));
}

// POLARIS (sat-io open-datasets)
var POLARIS = {
  bd_mean:      'projects/sat-io/open-datasets/polaris/bd_mean',
  clay_mean:    'projects/sat-io/open-datasets/polaris/clay_mean',
  ksat_mean:    'projects/sat-io/open-datasets/polaris/ksat_mean',
  n_mean:       'projects/sat-io/open-datasets/polaris/n_mean',
  om_mean:      'projects/sat-io/open-datasets/polaris/om_mean',
  ph_mean:      'projects/sat-io/open-datasets/polaris/ph_mean',
  sand_mean:    'projects/sat-io/open-datasets/polaris/sand_mean',
  silt_mean:    'projects/sat-io/open-datasets/polaris/silt_mean',
  theta_r_mean: 'projects/sat-io/open-datasets/polaris/theta_r_mean',
  theta_s_mean: 'projects/sat-io/open-datasets/polaris/theta_s_mean',
  lambda_mean:  'projects/sat-io/open-datasets/polaris/lambda_mean',
  hb_mean:      'projects/sat-io/open-datasets/polaris/hb_mean',
  alpha_mean:   'projects/sat-io/open-datasets/polaris/alpha_mean'
};

function parseDepthCm(depthStr){
  var parts = depthStr.split('-');
  return {min: ee.Number.parse(parts[0]), max: ee.Number.parse(parts[1])};
}

function polarisStack(depthStr){
  var d = parseDepthCm(depthStr);
  var keys = Object.keys(POLARIS);
  var imgOut = ee.Image([]);
  keys.forEach(function(k){
    var ic = ee.ImageCollection(POLARIS[k]).filter(ee.Filter.and(
      ee.Filter.gte('min_depth', d.min),
      ee.Filter.lte('max_depth', d.max)
    ));
    var bandName = 'polaris_' + k;
    var bandImg = ee.Image(ee.Algorithms.If(
      ic.size().gt(0),
      ee.Image(ic.first()).select([0]).rename(bandName),
      ee.Image.constant(0).updateMask(ee.Image.constant(0)).rename(bandName)
    ));
    imgOut = imgOut.addBands(bandImg);
  });
  return imgOut;
}

/* ---------- SoilGrids (ISRIC) ---------- */
var ISRIC = {
  bdod_mean: ee.Image('projects/soilgrids-isric/bdod_mean'),
  soc_mean:  ee.Image('projects/soilgrids-isric/soc_mean'),
  ocs_mean:  ee.Image('projects/soilgrids-isric/ocs_mean')
};

function soilgridsBandName(prefix, depthStr){
  return prefix + '_' + depthStr + 'cm_mean';
}

function soilgridsStack(depthStr){
  var bd_band  = soilgridsBandName('bdod', depthStr);
  var soc_band = soilgridsBandName('soc',  depthStr);

  var bd_raw  = ISRIC.bdod_mean.select([bd_band]).rename('isric_bdod_raw');
  var soc_raw = ISRIC.soc_mean.select([soc_band]).rename('isric_soc_raw');

  // OCS is 0–30 only in this asset (per your bandNames)
  var ocs_raw = ISRIC.ocs_mean.select(['ocs_0-30cm_mean']).rename('isric_ocs0_30_raw');

  // Conversions:
  // bdod: cg/cm^3 -> g/cm^3 : *0.01
  var bd_gcm3 = bd_raw.multiply(0.01).rename('isric_bdod_gcm3');
  // soc: dg/kg -> % : *0.01
  var soc_pct = soc_raw.multiply(0.01).rename('isric_soc_pct');

  // ocs: treat as tC/ha. also compute tC/ac
  var HA_TO_AC = 2.4710538147;
  var ocs_t_ha = ocs_raw.rename('isric_ocs0_30_t_ha');
  var ocs_t_ac = ocs_t_ha.divide(HA_TO_AC).rename('isric_ocs0_30_t_ac');

  return ee.Image.cat([bd_gcm3, soc_pct, ocs_t_ha, ocs_t_ac]);
}

/* ---------- gNATSGO SOC 0–30 ---------- */
var GNAT_SOC0_30_IC = ee.ImageCollection('projects/sat-io/open-datasets/gNATSGO/raster/soc0_30');
function gnatsgoSoc0_30_mosaic(){
  return GNAT_SOC0_30_IC.mosaic().rename('gnatsgo_soc0_30_native');
}

/* ---------- DEBUG prints ---------- */
print('--- DEBUG: SoilGrids assets bandNames ---');
print('ISRIC bdod_mean bandNames:', ISRIC.bdod_mean.bandNames());
print('ISRIC soc_mean  bandNames:', ISRIC.soc_mean.bandNames());
print('ISRIC ocs_mean  bandNames:', ISRIC.ocs_mean.bandNames());
print('--- DEBUG: gNATSGO soc0_30 collection & mosaic info ---');
print('gNATSGO soc0_30 collection count:', GNAT_SOC0_30_IC.size());
print('gNATSGO soc0_30 first image:', GNAT_SOC0_30_IC.first());
print('gNATSGO soc0_30 mosaic image:', gnatsgoSoc0_30_mosaic());
print('gNATSGO soc0_30 mosaic bandNames:', gnatsgoSoc0_30_mosaic().bandNames());

/* ---------- Formatting helpers ---------- */
function fmtNum(x, digits){
  digits = digits || 4;
  return (x === null || x === undefined) ? 'NA' : (Math.round(x * Math.pow(10,digits)) / Math.pow(10,digits));
}

/* ---------- SOC conversion constants ---------- */
var HA_TO_AC = 2.4710538147;
var GPM2_TO_THA = 0.01;              // g/m² -> t/ha
var GPM2_TO_TAC = 0.01 / HA_TO_AC;   // g/m² -> t/ac  (≈ 0.004046856)

/* Put ALL covariates into a single panel so nothing gets inserted mid-block */
function addCovariatesToPanel(covPanel, geom){
  covPanel.clear();

  var requestedYear = covYearBox.getValue();
  var depth = soilDepthSel.getValue();

  covPanel.add(ui.Label('--- STATIC COVARIATES (field mean) ---', {fontWeight:'bold', margin:'8px 0 4px 0'}));
  covPanel.add(ui.Label('DAYMET year (requested): ' + requestedYear + ' | Depth: ' + depth + ' cm', {fontSize:'11px', color:'#666'}));

  var terr = terrainStack().reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 10,
    tileScale: 4,
    maxPixels: 1e9
  });

  var dayImg = daymetStackSafe(requestedYear);
  var daym = dayImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 1000,
    tileScale: 4,
    maxPixels: 1e9
  });

  var pol  = polarisStack(depth).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 30,
    tileScale: 4,
    maxPixels: 1e9
  });

  var isricImg = soilgridsStack(depth);
  var isric = isricImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 250,
    tileScale: 4,
    maxPixels: 1e9
  });

  var gnatImg = gnatsgoSoc0_30_mosaic();
  var gnat = gnatImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 30,
    tileScale: 4,
    maxPixels: 1e9
  });

  var dayYearUsed = dayImg.get('daymet_year_used');

  ee.Dictionary(terr)
    .combine(ee.Dictionary(daym), true)
    .combine(ee.Dictionary(pol), true)
    .combine(ee.Dictionary(isric), true)
    .combine(ee.Dictionary(gnat), true)
    .set('daymet_year_used', dayYearUsed)
    .evaluate(function(d, err){
      if (err || !d){
        covPanel.add(ui.Label('Covariate error: ' + (err || 'No data'), {color:'red'}));
        return;
      }

      covPanel.add(ui.Label('Terrain', {fontWeight:'bold', margin:'6px 0 0 0'}));
      covPanel.add(ui.Label(
        'DEM(m): ' + fmtNum(d.dem_m) +
        ' | Slope(deg): ' + fmtNum(d.slope_deg) +
        ' | Aspect(deg): ' + fmtNum(d.aspect_deg) +
        ' | Hillshade: ' + fmtNum(d.hillshade)
      ));

      covPanel.add(ui.Label('DAYMET (annual)', {fontWeight:'bold', margin:'6px 0 0 0'}));
      covPanel.add(ui.Label('DAYMET year used: ' + d.daymet_year_used, {fontSize:'11px', color:'#666'}));
      covPanel.add(ui.Label(
        'tmin_mean(°C): ' + fmtNum(d.daymet_tmin_mean_C) +
        ' | tmax_mean(°C): ' + fmtNum(d.daymet_tmax_mean_C) +
        ' | mean_temperature: ' + fmtNum(d.daymet_mean_temperature) +
        ' | prcp_sum(mm): ' + fmtNum(d.daymet_prcp_sum_mm)
      ));

      covPanel.add(ui.Label('POLARIS (field mean)', {fontWeight:'bold', margin:'6px 0 0 0'}));
      var pkeys = Object.keys(d).filter(function(k){ return k.indexOf('polaris_') === 0; }).sort();
      var line = [];
      pkeys.forEach(function(k, i){
        line.push(k.replace('polaris_','') + ': ' + fmtNum(d[k]));
        if (line.length === 4 || i === pkeys.length - 1){
          covPanel.add(ui.Label(line.join(' | '), {fontSize:'11px'}));
          line = [];
        }
      });

      covPanel.add(ui.Label('Soil carbon + bulk density (SoilGrids + gNATSGO)', {fontWeight:'bold', margin:'8px 0 0 0'}));

      // SoilGrids
      var sg_soc_pct  = d.isric_soc_pct;
      var sg_bd_gcm3  = d.isric_bdod_gcm3;
      var sg_ocs_t_ha = d.isric_ocs0_30_t_ha;
      var sg_ocs_t_ac = d.isric_ocs0_30_t_ac;

      covPanel.add(ui.Label(
        'SoilGrids SOC% (' + depth + '): ' + fmtNum(sg_soc_pct, 3) + ' %' +
        ' | SoilGrids BD (' + depth + '): ' + fmtNum(sg_bd_gcm3, 3) + ' g/cm³',
        {fontSize:'11px'}
      ));
      covPanel.add(ui.Label(
        'SoilGrids SOC stock (0–30cm): ' + fmtNum(sg_ocs_t_ha, 2) + ' tC/ha | ' + fmtNum(sg_ocs_t_ac, 2) + ' tC/ac',
        {fontSize:'11px'}
      ));

      // gNATSGO (assume native = gC/m² for 0–30cm stock)
      var gn_native = d.gnatsgo_soc0_30_native; // e.g., ~5402
      var gn_t_ha = (gn_native === null || gn_native === undefined) ? null : (gn_native * GPM2_TO_THA);
      var gn_t_ac = (gn_native === null || gn_native === undefined) ? null : (gn_native * GPM2_TO_TAC);

      covPanel.add(ui.Label(
        'gNATSGO SOC 0–30 (native): ' + fmtNum(gn_native, 2) + ' (assumed gC/m²)',
        {fontSize:'11px', color:'#444'}
      ));
      covPanel.add(ui.Label(
        'gNATSGO SOC stock (0–30cm): ' + fmtNum(gn_t_ha, 2) + ' tC/ha | ' + fmtNum(gn_t_ac, 2) + ' tC/ac',
        {fontSize:'11px', color:'#444'}
      ));

      covPanel.add(ui.Label(
        'Side-by-side (0–30): SoilGrids ' + fmtNum(sg_ocs_t_ha, 2) + ' tC/ha (' + fmtNum(sg_ocs_t_ac, 2) + ' tC/ac)' +
        '  vs gNATSGO ' + fmtNum(gn_t_ha, 2) + ' tC/ha (' + fmtNum(gn_t_ac, 2) + ' tC/ac)',
        {fontSize:'11px', color:'#222'}
      ));
    });
}

/* ---------- Run / Update (fast) ---------- */
function fillWeeksFast(){
  var weeks = weeklySequence(startBox.getValue(), endBox.getValue());
  var fc = ee.FeatureCollection(weeks.map(function(ws){
    var we = ee.Date(ws).advance(1,'week');
    var n  = state.s2Base.filterDate(ws, we).size();
    return ee.Feature(null, {w: ee.Date(ws).format('YYYY-MM_dd'), n: n});
  }));

  fc.aggregate_array('w').evaluate(function(ws, error){
    if (error) {
      statusLabel.setValue('Error loading weeks: ' + error);
      return;
    }
    state.allWeeksWithScenes = ws || [];
    if (state.allWeeksWithScenes.length > 0) {
      updateWeekSelect(state.allWeeksWithScenes, state.allWeeksWithScenes[0]);
      statusLabel.setValue('Ready. Pick a week or click a field.');
    } else {
      statusLabel.setValue('No weeks found with S2 data.');
    }
  });
}

function applyBasemapDimmer(){
  var name = 'Basemap Dimmer';
  var layers = Map.layers();
  for (var i = layers.length()-1; i >= 0; i--) {
    var L = layers.get(i);
    if (L.getName() === name) { Map.remove(L); }
  }
  var op = baseDimSlider.getValue();
  if (op > 0){
    var dim = ee.Image.constant(0).visualize({palette:['000000'], min:0, max:1});
    var dimLayer = ui.Map.Layer(dim, {}, name, true, op);
    Map.layers().insert(0, dimLayer);
  }
}
baseDimSlider.onChange(applyBasemapDimmer);

function update(){
  statusLabel.setValue('Filtering collections…');
  updateWeekSelect([], null);

  var v = validateDateRange(startBox.getValue(), endBox.getValue());
  if (!v.valid) { statusLabel.setValue('Invalid date range.'); return; }

  var bounds = fields.geometry().bounds();

  state.s2Base = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(bounds)
    .filterDate(startBox.getValue(), endBox.getValue())
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudSlide.getValue()))
    .map(maskS2clouds);

  state.s1Base = sarToggle.getValue() ? ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(bounds)
    .filterDate(startBox.getValue(), endBox.getValue())
    .filter(ee.Filter.eq('instrumentMode','IW'))
    .filter(ee.Filter.eq('resolution_meters',10))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH')) : null;

  applyBasemapDimmer();

  // refresh CDL layer
  var layers = Map.layers();
  for (var i = layers.length()-1; i >= 0; i--) {
    var layer = layers.get(i);
    if (layer.getName() === 'CDL ' + CDL_LAST) { Map.remove(layer); }
  }
  Map.addLayer(cdlImage(CDL_LAST).clipToCollection(fields), {}, 'CDL ' + CDL_LAST, true);

  statusLabel.setValue('Building week list…');
  fillWeeksFast();
}
runBtn.onClick(update);

/* ---------- Overlays ---------- */
function visFor(which){
  return (which === 'NDVI')
    ? {min:0, max:0.8, palette:['a59d95','e4ffaf','00e400','016c0e']}
    : {min:0.1, max:0.9, palette:['#30123b','#3c5aa8','#56c18d','#74d14c','#b7ef1a']};
}
function addOverlay(){
  var wk = weekSelect.getValue();
  if (!wk){ return; }
  var which = indexSelect.getValue();
  var op    = alphaSlider.getValue();
  var img   = composeWeek(ee.Date.parse('YYYY-MM_dd', wk));

  function addOne(band){
    Map.addLayer(img.select(band), visFor(band), band + ' • ' + wk, true, op);
  }
  if (which === 'Both'){ addOne('NDVI'); addOne('EVI'); }
  else { addOne(which); }
}
function clearOverlays(){
  var keep = {'Fields': true};
  keep['CDL ' + CDL_LAST] = true;
  var layers = Map.layers();
  for (var i = layers.length()-1; i >= 0; i--){
    var L = layers.get(i);
    var layerName = L.getName();
    if (!keep[layerName] && layerName.indexOf('CDL') !== 0) { Map.remove(L); }
  }
}
addOverlayBtn.onClick(addOverlay);
clearOverlayBtn.onClick(clearOverlays);

/* ---------- Photo overlay (unchanged) ---------- */
function addPhotoOverlay(){
  var wk = weekSelect.getValue();
  if (!wk){ statusLabel.setValue('Pick a week first for Photo.'); return; }
  if (!state.lastGeom){ statusLabel.setValue('Click a field first.'); return; }

  var geom = state.lastGeom;
  var ws = ee.Date.parse('YYYY-MM_dd', wk);
  var we = ws.advance(1,'week');

  var srcPref = photoSourceSel.getValue();
  var landsatCol = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(geom)
    .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), we.advance(lsMaxDeltaDays, 'day'))
    .sort('system:time_start');
  var s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), we.advance(lsMaxDeltaDays, 'day'))
    .sort('system:time_start');
  var naipCol = ee.ImageCollection('USDA/NAIP/DOQQ')
    .filterBounds(geom)
    .filterDate(ws.advance(-naipMaxAgeDays, 'day'), we.advance(naipMaxAgeDays, 'day'))
    .sort('system:time_start');

  function pickClosest(col){
    var withDiff = col.map(function(img){
      var t = ee.Number(img.get('system:time_start'));
      var diff = t.subtract(ws.millis()).abs();
      return img.set('date_diff', diff);
    }).sort('date_diff');
    return ee.Image(withDiff.first());
  }

  var order = srcPref === 'S2 → NAIP → Landsat' ? ['S2','NAIP','LS']
            : srcPref === 'NAIP → Landsat' ? ['NAIP','LS']
            : ['LS','NAIP','S2'];

  var choice = ee.Dictionary({src: 'NONE', img: null});
  choice = ee.Dictionary(ee.Algorithms.If(order[0] === 'LS',
    ee.Algorithms.If(landsatCol.size().gt(0), {src:'LS', img: pickClosest(landsatCol)}, choice),
    choice));
  choice = ee.Dictionary(ee.Algorithms.If(order[0] === 'S2',
    ee.Algorithms.If(s2Col.size().gt(0), {src:'S2', img: pickClosest(s2Col)}, choice),
    choice));
  choice = ee.Dictionary(ee.Algorithms.If(order[0] === 'NAIP',
    ee.Algorithms.If(naipCol.size().gt(0), {src:'NAIP', img: pickClosest(naipCol)}, choice),
    choice));

  choice = ee.Dictionary(ee.Algorithms.If(ee.Algorithms.IsEqual(choice.get('src'), 'NONE'),
    ee.Algorithms.If(order.indexOf('LS') > 0,
      ee.Algorithms.If(landsatCol.size().gt(0), {src:'LS', img: pickClosest(landsatCol)}, choice),
      choice),
    choice));
  choice = ee.Dictionary(ee.Algorithms.If(ee.Algorithms.IsEqual(choice.get('src'), 'NONE'),
    ee.Algorithms.If(order.indexOf('S2') > 0,
      ee.Algorithms.If(s2Col.size().gt(0), {src:'S2', img: pickClosest(s2Col)}, choice),
      choice),
    choice));
  choice = ee.Dictionary(ee.Algorithms.If(ee.Algorithms.IsEqual(choice.get('src'), 'NONE'),
    ee.Algorithms.If(order.indexOf('NAIP') > 0,
      ee.Algorithms.If(naipCol.size().gt(0), {src:'NAIP', img: pickClosest(naipCol)}, choice),
      choice),
    choice));

  var src = ee.String(choice.get('src'));
  var img = ee.Image(choice.get('img'));

  src.evaluate(function(s){
    if (!s || s === 'NONE') { statusLabel.setValue('No photo available near this week.'); return; }
    img.get('system:time_start').evaluate(function(ts){
      var dateStr = new Date(ts).toISOString().split('T')[0];
      var layerName = 'Photo • ' + s + ' • ' + dateStr;

      if (s === 'NAIP'){
        Map.addLayer(img.clip(geom), {bands:['R','G','B'], min:0, max:255}, layerName, true, alphaSlider.getValue());
        statusLabel.setValue(layerName + ' added.');
        return;
      }

      if (s === 'LS'){
        var ls = img.select(['SR_B4','SR_B3','SR_B2']).multiply(2.75e-05).add(-0.2);
        var qa = img.select('QA_PIXEL');
        var clear = qa.bitwiseAnd(1<<3).eq(0).and(qa.bitwiseAnd(1<<4).eq(0));
        ls = ls.updateMask(clear).rename(['B4','B3','B2']);
        Map.addLayer(ls.clip(geom), {bands:['B4','B3','B2'], min: 0.0, max: 0.35, gamma: 1.05}, layerName, true, alphaSlider.getValue());
        statusLabel.setValue(layerName + ' added.');
        return;
      }

      if (s === 'S2'){
        var s2 = img.select(['B4','B3','B2']).divide(10000);
        var scl = img.select('SCL');
        var clear2 = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
        s2 = s2.updateMask(clear2);
        Map.addLayer(s2.clip(geom), {bands:['B4','B3','B2'], min: 0.0, max: 0.35, gamma: 1.05}, layerName, true, alphaSlider.getValue());
        statusLabel.setValue(layerName + ' added.');
      }
    });
  });
}
photoBtn.onClick(addPhotoOverlay);

/* ---------- Popup ---------- */
var pop = ui.Panel({
  style:{position:'bottom-left', width:'480px', maxHeight:'55%', padding:'8px',
         backgroundColor:'rgba(255,255,255,0.92)'}
});
Map.add(pop);

/* MODIS chart */
function chartMODIS(geom){
  function prep(ic){
    return ic.select('NDVI').map(function(img){
      var scaled = img.multiply(0.0001).updateMask(img.neq(-3000))
        .copyProperties(img, img.propertyNames());
      return scaled;
    });
  }
  var terra = prep(ee.ImageCollection('MODIS/061/MOD13Q1')
    .filterBounds(geom).filterDate(startBox.getValue(), endBox.getValue()));
  var aqua  = prep(ee.ImageCollection('MODIS/061/MYD13Q1')
    .filterBounds(geom).filterDate(startBox.getValue(), endBox.getValue()));
  var merged = terra.merge(aqua);
  return ui.Chart.image.seriesByRegion({
    imageCollection: merged,
    regions: ee.FeatureCollection([ee.Feature(geom)]),
    reducer: ee.Reducer.mean(), band: 'NDVI', scale: 250,
    xProperty: 'system:time_start'
  }).setOptions({title:'MODIS NDVI (Terra + Aqua, 16-day)',
    hAxis:{title:'Date'}, vAxis:{title:'NDVI'}, lineWidth:2, pointSize:1});
}

/* Search functionality */
function searchField() {
  var searchId = searchBox.getValue().trim();
  if (!searchId) { statusLabel.setValue('Enter a poly_id to search'); return; }
  statusLabel.setValue('Searching for field ' + searchId + '...');
  var targetField = fields.filter(ee.Filter.eq('poly_id', searchId));

  targetField.size().evaluate(function(count, error) {
    if (error) { statusLabel.setValue('Search error: ' + error); return; }
    if (count === 0) { statusLabel.setValue('Field ' + searchId + ' not found'); return; }
    Map.centerObject(targetField, 16);
    statusLabel.setValue('Found field ' + searchId);
    state.lastGeom = targetField.first().geometry();
    state.lastPid = searchId;
    Map.addLayer(targetField.style({color:'red', width:4, fillColor:'00000000'}), {}, 'Search Result', true);
  });
}
searchBtn.onClick(searchField);

/* Click handler */
Map.onClick(function(coords){
  pop.clear();
  if (!state.s2Base){ pop.add(ui.Label('Run the tool first.')); return; }

  var pt  = ee.Geometry.Point([coords.lon, coords.lat]);
  var hit = fields.filterBounds(pt).first();
  if (!hit){ pop.add(ui.Label('Click inside a field.')); return; }

  var pid  = ee.String(ee.Feature(hit).get('poly_id'));
  var geom = ee.Feature(hit).geometry();
  state.lastGeom = geom; state.lastPid = pid;

  // Header
  var analysisHeader = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', backgroundColor: '#f0f8ff', padding: '6px', margin: '0 0 8px 0', border: '1px solid #4a90e2'}
  });
  var fieldLabel = ui.Label('Field Analysis - poly_id: ' + pid.getInfo(),
    {fontWeight:'bold', fontSize:'12px', stretch: 'horizontal'});
  var analysisCloseBtn = ui.Button({label: '✕', style: {color: 'red', padding: '2px 6px', fontSize: '12px'}});
  analysisCloseBtn.onClick(function(){ pop.clear(); pop.add(ui.Label('Analysis popup closed.', {color: 'gray', fontSize: '11px'})); });
  analysisHeader.add(fieldLabel).add(analysisCloseBtn);
  pop.add(analysisHeader);

  // Click coords
  var coordsPanel = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {backgroundColor: '#f9f9f9', padding: '4px', margin: '4px 0', border: '1px solid #ddd'}
  });
  coordsPanel.add(ui.Label('📍 Click Location: ' + coords.lon.toFixed(6) + '°, ' + coords.lat.toFixed(6) + '°',
    {fontSize:'11px', color:'#0066cc', fontWeight:'bold', stretch: 'horizontal'}));
  pop.add(coordsPanel);

  // ---- FIX: placeholders added NOW so they stay at the top ----
  var cdlLabel = ui.Label('CDL ' + CDL_LAST + ' crop type: (loading...)', {fontWeight:'bold', color:'brown'});
  var pixLabel = ui.Label('Pixel @ click — NDVI: (loading...), EVI: (loading...)');
  var fldLabel = ui.Label('Field mean — NDVI: (loading...), EVI: (loading...), BSI: (loading...)');
  var wkLabel  = ui.Label('Week: (loading...)', {margin:'8px 0 4px 0'});
  pop.add(cdlLabel);
  pop.add(pixLabel);
  pop.add(fldLabel);
  pop.add(wkLabel);
  // ------------------------------------------------------------

  // CDL crop type (async: update placeholder text)
  var mode = cdlImage(CDL_LAST).reduceRegion({
    reducer: ee.Reducer.mode(),
    geometry: geom, scale:30, maxPixels:1e6, tileScale:2, bestEffort: true
  }).get('cropland');
  mode.evaluate(function(cropCode, error1){
    if (error1 || cropCode === null || cropCode === undefined) {
      cdlLabel.setValue('CDL crop type: Error - ' + (error1 || 'No data'));
      return;
    }
    var legend = cdlLegendDict();
    var cropName = legend[String(cropCode)] || ('Unknown crop (code: ' + cropCode + ')');
    cdlLabel.setValue('CDL ' + CDL_LAST + ' crop type: ' + cropName);
  });

  // Week selection
  var wk = weekSelect.getValue();
  if (!wk && state.allWeeksWithScenes.length) wk = state.allWeeksWithScenes[0];
  wkLabel.setValue('Week: ' + (wk || 'None'));

  // Pixel + field stats for selected week (async: update placeholders)
  if (wk){
    var img = composeWeek(ee.Date.parse('YYYY-MM_dd', wk));
    var pix = img.reduceRegion({reducer: ee.Reducer.first(), geometry: pt, scale:10, maxPixels:1e9});
    var mean = img.reduceRegion({reducer: ee.Reducer.mean(), geometry: geom, scale:20, tileScale:8, maxPixels:1e9});

    ee.Dictionary({
      p_ndvi: pix.get('NDVI'),
      p_evi:  pix.get('EVI'),
      f_ndvi: mean.get('NDVI'),
      f_evi:  mean.get('EVI'),
      f_bsi:  mean.get('BSI')
    }).evaluate(function(s, error){
      function fmt(x){ return (x===null || x===undefined) ? 'NA' : (Math.round(x*1000)/1000); }
      if (error || !s) {
        pixLabel.setValue('Pixel @ click — error: ' + (error || 'No data'));
        fldLabel.setValue('Field mean — error: ' + (error || 'No data'));
        return;
      }
      pixLabel.setValue('Pixel @ click — NDVI: ' + fmt(s.p_ndvi) + ', EVI: ' + fmt(s.p_evi));
      fldLabel.setValue('Field mean — NDVI: ' + fmt(s.f_ndvi) + ', EVI: ' + fmt(s.f_evi) + ', BSI: ' + fmt(s.f_bsi));
    });
  } else {
    wkLabel.setValue('Week: None (no valid weeks)');
    pixLabel.setValue('Pixel @ click — NA');
    fldLabel.setValue('Field mean — NA');
  }

  // MODIS chart
  try { pop.add(chartMODIS(geom)); } catch (modisError) { pop.add(ui.Label('MODIS chart error: ' + modisError.message, {color:'red'})); }

  // Analysis options
  pop.add(ui.Label('--- ANALYSIS OPTIONS ---', {fontWeight:'bold', color:'blue', margin:'10px 0 4px 0'}));
  pop.add(ui.Label('Use buttons above to run analyses separately:', {fontSize:'11px', color:'#444'}));
  pop.add(ui.Label('• Cover Crop Analysis  • Tillage Detection  • Sentinel-2 Chart', {fontSize:'11px', color:'gray'}));

  // STATIC COVARIATES BLOCK
  var covPanel = ui.Panel({style:{margin:'6px 0 6px 0'}});
  pop.add(covPanel);
  addCovariatesToPanel(covPanel, geom);
});

/* ---------- Contact sheet timeline (horizontal popup at top of map) ---------- */
showSheet.onClick(function(){
  if (!state.s2Base || !state.lastGeom){
    statusLabel.setValue('Click a field first before showing the visual timeline.');
    return;
  }

  var geom = state.lastGeom;
  var idx  = sheetIdx.getValue();
  var maxN = sheetN.getValue();

  // If "Hide invalid S2 weeks" is enabled, load more candidates so we can still fill N frames
  var loadCount = hideInvalid.getValue() ? Math.min(maxN * 3, 52) : maxN;
  var baseWeeks = (state.refinedWeeks && state.refinedWeeks.length >= loadCount)
    ? state.refinedWeeks
    : state.allWeeksWithScenes;

  var candidateWeeks = (baseWeeks || []).slice(0, loadCount);
  if (!candidateWeeks.length){
    statusLabel.setValue('No weeks available. Try Run / Update or widen the date range.');
    return;
  }

  // Helper to proceed once we have the weeks list (already filtered or not)
  function proceedWithTimeline(weeks){
    if (!weeks || !weeks.length){
      statusLabel.setValue('No weeks available for visual timeline.');
      return;
    }

    // Adaptive thumbnail sizing (supports up to 52 frames)
    var thumbSize, cellWidth, gridMaxHeight, popupMaxHeight;
    if (weeks.length <= 8) {
      thumbSize = 120; cellWidth = '130px'; gridMaxHeight = '180px'; popupMaxHeight = '220px';
    } else if (weeks.length <= 12) {
      thumbSize = 100; cellWidth = '110px'; gridMaxHeight = '220px'; popupMaxHeight = '280px';
    } else if (weeks.length <= 16) {
      thumbSize = 90; cellWidth = '100px'; gridMaxHeight = '240px'; popupMaxHeight = '300px';
    } else if (weeks.length <= 24) {
      thumbSize = 80; cellWidth = '90px'; gridMaxHeight = '260px'; popupMaxHeight = '320px';
    } else if (weeks.length <= 36) {
      thumbSize = 70; cellWidth = '80px'; gridMaxHeight = '280px'; popupMaxHeight = '340px';
    } else {
      thumbSize = 60; cellWidth = '70px'; gridMaxHeight = '300px'; popupMaxHeight = '360px';
    }

    // Remove existing popup
    if (state.contactSheetPopup){
      Map.remove(state.contactSheetPopup);
      state.contactSheetPopup = null;
    }

    state.contactSheetPopup = ui.Panel({
      style: {
        position: 'top-center',
        width: '95%',
        maxHeight: popupMaxHeight,
        backgroundColor: 'rgba(255,255,255,0.95)',
        border: '2px solid #0078d4',
        padding: '8px',
        margin: '10px'
      }
    });

    // Header row
    var topHeader = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {stretch: 'horizontal', margin: '0 0 8px 0'}
    });

    var titleText = (idx === 'ALL') ? 'NDVI + EVI + NAIP Timeline' : (idx + ' Timeline');
    var pidText = (typeof state.lastPid === 'string')
      ? state.lastPid
      : (state.lastPid && state.lastPid.getInfo ? state.lastPid.getInfo() : 'unknown');

    var topTitle = ui.Label(titleText + ' - Field ' + pidText + ' (' + weeks.length + ' of ' + maxN + ' weeks)', {
      fontWeight: 'bold',
      fontSize: '14px',
      stretch: 'horizontal'
    });

    var topCloseBtn = ui.Button({label: '✕', style: {color: 'red', padding: '4px 8px'}});
    topCloseBtn.onClick(function(){
      if (state.contactSheetPopup){
        Map.remove(state.contactSheetPopup);
        state.contactSheetPopup = null;
      }
      statusLabel.setValue('Visual timeline closed.');
    });

    topHeader.add(topTitle).add(topCloseBtn);
    state.contactSheetPopup.add(topHeader);

    // Thumbnails grid
    var timelineGrid = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {
        stretch: 'horizontal',
        maxHeight: gridMaxHeight,
        backgroundColor: '#f8f9fa',
        border: '1px solid #ddd',
        padding: '4px'
      }
    });

    var smallSize = Math.floor(thumbSize * 0.6);

    weeks.forEach(function(w){
      var dateLbl = ui.Label(w, {fontSize: '9px', margin: '0 0 2px 0', textAlign: 'center'});
      var reasonLbl = ui.Label('', {fontSize:'9px', color:'red', textAlign:'center', margin:'2px 0 0 0'});

      try {
        if (idx === 'NAIP') {
          // NAIP thumbnail for week (with Landsat fallback)
          var ws = ee.Date.parse('YYYY-MM_dd', w);

          var naip = ee.ImageCollection('USDA/NAIP/DOQQ')
            .filterBounds(geom)
            .filterDate(ws.advance(-naipMaxAgeDays, 'day'), ws.advance(naipMaxAgeDays, 'day'))
            .sort('system:time_start');

          var ls9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
            .filterBounds(geom)
            .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), ws.advance(lsMaxDeltaDays, 'day'))
            .sort('system:time_start');

          function pickClosest(col){
            var withDiff = col.map(function(img){
              var t = ee.Number(img.get('system:time_start'));
              var diff = t.subtract(ws.millis()).abs();
              return img.set('date_diff', diff);
            }).sort('date_diff');
            return ee.Image(withDiff.first());
          }

          // Prefer Landsat if it's close enough; else NAIP if available
          var lsBest  = pickClosest(ls9);
          var naipBest= pickClosest(naip);

          var lsIsFresh = ls9.size().gt(0).and(ee.Number(lsBest.get('date_diff')).lte(ee.Number(lsMaxDeltaDays).multiply(24*60*60*1000)));
          var useLs = lsIsFresh;

          var rgb = ee.Image(ee.Algorithms.If(useLs,
            // Landsat SR -> reflectance + cloud mask
            ee.Image(lsBest).select(['SR_B4','SR_B3','SR_B2']).multiply(2.75e-05).add(-0.2)
              .updateMask(ee.Image(lsBest).select('QA_PIXEL').bitwiseAnd(1<<3).eq(0)
                .and(ee.Image(lsBest).select('QA_PIXEL').bitwiseAnd(1<<4).eq(0)))
              .rename(['B4','B3','B2']),
            // NAIP
            ee.Image(naipBest)
          ));

          var vis = ee.Dictionary(ee.Algorithms.If(useLs,
            {bands:['B4','B3','B2'], min: 0.02, max: 0.3, gamma: 1.1},
            {bands:['R','G','B'], min:0, max:255}
          ));

          var th = ui.Thumbnail({
            image: rgb.clip(geom).visualize(vis),
            params: {region: geom, dimensions: thumbSize},
            style: {margin: '2px', border: '1px solid #444'}
          });

          timelineGrid.add(ui.Panel([dateLbl, th, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));

        } else if (idx === 'ALL') {
          // NDVI + EVI + NAIP stack in one cell
          var im = composeWeek(ee.Date.parse('YYYY-MM_dd', w));
          var ndviTh = ui.Thumbnail({
            image: im.select('NDVI').visualize(visFor('NDVI')),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          var eviTh = ui.Thumbnail({
            image: im.select('EVI').visualize(visFor('EVI')),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          // NAIP/Landsat thumbnail (same logic as NAIP case)
          var ws = ee.Date.parse('YYYY-MM_dd', w);

          var naip = ee.ImageCollection('USDA/NAIP/DOQQ')
            .filterBounds(geom)
            .filterDate(ws.advance(-naipMaxAgeDays, 'day'), ws.advance(naipMaxAgeDays, 'day'))
            .sort('system:time_start');

          var ls9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
            .filterBounds(geom)
            .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), ws.advance(lsMaxDeltaDays, 'day'))
            .sort('system:time_start');

          function pickClosest(col){
            var withDiff = col.map(function(img){
              var t = ee.Number(img.get('system:time_start'));
              var diff = t.subtract(ws.millis()).abs();
              return img.set('date_diff', diff);
            }).sort('date_diff');
            return ee.Image(withDiff.first());
          }

          var lsBest  = pickClosest(ls9);
          var naipBest= pickClosest(naip);
          var lsIsFresh = ls9.size().gt(0).and(ee.Number(lsBest.get('date_diff')).lte(ee.Number(lsMaxDeltaDays).multiply(24*60*60*1000)));
          var useLs = lsIsFresh;

          var rgb = ee.Image(ee.Algorithms.If(useLs,
            ee.Image(lsBest).select(['SR_B4','SR_B3','SR_B2']).multiply(2.75e-05).add(-0.2)
              .updateMask(ee.Image(lsBest).select('QA_PIXEL').bitwiseAnd(1<<3).eq(0)
                .and(ee.Image(lsBest).select('QA_PIXEL').bitwiseAnd(1<<4).eq(0)))
              .rename(['B4','B3','B2']),
            ee.Image(naipBest)
          ));

          var vis = ee.Dictionary(ee.Algorithms.If(useLs,
            {bands:['B4','B3','B2'], min: 0.02, max: 0.3, gamma: 1.1},
            {bands:['R','G','B'], min:0, max:255}
          ));

          var naipTh = ui.Thumbnail({
            image: rgb.clip(geom).visualize(vis),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          var thumbsPanel = ui.Panel([
            ui.Label('NDVI', {fontSize:'8px', textAlign:'center'}), ndviTh,
            ui.Label('EVI',  {fontSize:'8px', textAlign:'center'}), eviTh,
            ui.Label('NAIP', {fontSize:'8px', textAlign:'center'}), naipTh
          ], ui.Panel.Layout.flow('vertical'), {width: cellWidth});

          timelineGrid.add(ui.Panel([dateLbl, thumbsPanel, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));

        } else {
          // NDVI or EVI thumbnail
          var im = composeWeek(ee.Date.parse('YYYY-MM_dd', w));
          var th = ui.Thumbnail({
            image: im.select(idx).visualize(visFor(idx)),
            params: {region: geom, dimensions: thumbSize},
            style: {margin: '2px', border: '1px solid #444'}
          });

          timelineGrid.add(ui.Panel([dateLbl, th, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));
        }

        // If "Hide invalid" is off, still annotate invalid weeks (helps debugging)
        var ws2 = ee.Date.parse('YYYY-MM_dd', w);
        validFrac(ws2, geom, 20).evaluate(function(frac){
          var thr = minValidPct.getValue() / 100.0;
          if (frac === null || frac < thr) {
            reasonLbl.setValue('No valid S2 — try NAIP');
          }
        });

      } catch (e) {
        timelineGrid.add(ui.Panel([
          ui.Label(w + ' (thumb error)', {fontSize:'9px', color:'red', textAlign:'center'})
        ], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));
      }
    });

    state.contactSheetPopup.add(timelineGrid);

    var instrText = '💡 Timeline shows ' + (idx === 'ALL' ? 'NDVI + EVI + NAIP' : idx === 'NAIP' ? 'NAIP (or Landsat fallback)' : idx) +
      ' over ' + weeks.length + ' weeks (max ' + maxN + '). Scroll horizontally to see all frames.';
    state.contactSheetPopup.add(ui.Label(instrText, {
      fontSize: '10px', color: '#666', margin: '4px 0 0 0', textAlign: 'center'
    }));

    Map.add(state.contactSheetPopup);
    statusLabel.setValue('Visual timeline displayed with ' + weeks.length + ' weeks.');
  }

  // If filtering invalid weeks, do per-week validFrac checks (async)
  if (hideInvalid.getValue()){
    statusLabel.setValue('Filtering invalid S2 weeks for visual timeline…');
    var thr = minValidPct.getValue() / 100.0;
    var validFlags = [];
    for (var i = 0; i < candidateWeeks.length; i++) validFlags.push(false);

    var done = 0;
    candidateWeeks.forEach(function(w, i){
      var ws = ee.Date.parse('YYYY-MM_dd', w);
      validFrac(ws, geom, 20).evaluate(function(frac){
        done++;
        if (frac !== null && frac >= thr) validFlags[i] = true;

        if (done === candidateWeeks.length){
          var ordered = [];
          for (var j = 0; j < candidateWeeks.length; j++){
            if (validFlags[j]) ordered.push(candidateWeeks[j]);
          }
          proceedWithTimeline(ordered.slice(0, maxN));
        }
      });
    });
  } else {
    proceedWithTimeline(candidateWeeks.slice(0, maxN));
  }
});



/* ---------- initial run ---------- */
uiPanel.add(advToggle);
uiPanel.add(advPanel);
update();

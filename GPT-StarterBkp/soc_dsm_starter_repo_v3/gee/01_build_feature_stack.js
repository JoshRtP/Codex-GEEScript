/****
SOC DSM Starter Repo - 01_build_feature_stack.js
Builds a predictor stack for SOC modeling.
Replace asset IDs and tune masks/temporal windows for your geography.
****/

var aoi = ee.FeatureCollection('projects/your-project/assets/project_boundary');

function maskS2Clouds(img) {
  var scl = img.select('SCL');
  var good = scl.neq(3)   // cloud shadow
    .and(scl.neq(8))      // cloud medium probability
    .and(scl.neq(9))      // cloud high probability
    .and(scl.neq(10))     // cirrus
    .and(scl.neq(11));    // snow
  return img.updateMask(good)
    .copyProperties(img, ['system:time_start']);
}

function addIndices(img) {
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('ndvi');
  var evi = img.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      NIR: img.select('B8'),
      RED: img.select('B4'),
      BLUE: img.select('B2')
    }).rename('evi');
  var ndti = img.normalizedDifference(['B11', 'B12']).rename('ndti');
  var nbr2 = img.normalizedDifference(['B11', 'B12']).rename('nbr2');
  var brightness = img.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .reduce(ee.Reducer.mean())
    .rename('brightness');
  return img.addBands([ndvi, evi, ndti, nbr2, brightness]);
}

function bareSoilMask(img) {
  var bare = img.select('ndvi').lt(0.25);
  return img.updateMask(bare);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate('2022-01-01', '2024-12-31')
  .map(maskS2Clouds)
  .map(addIndices);

var vegComp = s2.select(['B2','B3','B4','B8','B11','B12','ndvi','evi','ndti','nbr2','brightness'])
  .median();

var ndviStd = s2.select('ndvi').reduce(ee.Reducer.stdDev()).rename('ndvi_std');
var ndviP10 = s2.select('ndvi').reduce(ee.Reducer.percentile([10])).rename('ndvi_p10');
var ndviP90 = s2.select('ndvi').reduce(ee.Reducer.percentile([90])).rename('ndvi_p90');
var eviStd = s2.select('evi').reduce(ee.Reducer.stdDev()).rename('evi_std');

var bareComp = s2
  .map(bareSoilMask)
  .select(['B2','B3','B4','B8','B11','B12','brightness'])
  .median()
  .rename(['bare_B2','bare_B3','bare_B4','bare_B8','bare_B11','bare_B12','bare_brightness']);

var dem = ee.Image('USGS/SRTMGL1_003').clip(aoi).rename('elev');
var terrain = ee.Algorithms.Terrain(dem);
var slope = terrain.select('slope');
var aspect = terrain.select('aspect');

// Example climate inputs; swap for your preferred normals.
var terraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('2014-01-01', '2023-12-31')
  .select(['pr', 'tmmn', 'tmmx'])
  .mean()
  .rename(['clim_pr_mean', 'clim_tmmn_mean', 'clim_tmmx_mean']);

// Placeholder crop history proxy using annual CDL mode would usually be built separately.
// Add SoilGrids / SSURGO / custom rasters here as additional bands.

var featureStack = vegComp
  .addBands(ndviStd)
  .addBands(ndviP10)
  .addBands(ndviP90)
  .addBands(eviStd)
  .addBands(bareComp)
  .addBands(dem)
  .addBands(slope)
  .addBands(aspect)
  .addBands(terraclimate)
  .clip(aoi)
  .float();

print('Feature stack bands', featureStack.bandNames());
Map.centerObject(aoi, 10);
Map.addLayer(featureStack.select('ndvi'), {min: 0, max: 0.8}, 'NDVI median');
Map.addLayer(featureStack.select('bare_brightness'), {min: 500, max: 2500}, 'Bare brightness');

Export.image.toAsset({
  image: featureStack,
  description: 'soc_feature_stack_v1_asset',
  assetId: 'projects/your-project/assets/soc_feature_stack_v1',
  region: aoi.geometry(),
  scale: 10,
  maxPixels: 1e13
});

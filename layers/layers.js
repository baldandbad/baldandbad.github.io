var wms_layers = [];

var format_tphcm2tphcm__boundary_administrative_tphcm_0 = new ol.format.GeoJSON();
var features_tphcm2tphcm__boundary_administrative_tphcm_0 = format_tphcm2tphcm__boundary_administrative_tphcm_0.readFeatures(json_tphcm2tphcm__boundary_administrative_tphcm_0, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_tphcm2tphcm__boundary_administrative_tphcm_0 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_tphcm2tphcm__boundary_administrative_tphcm_0.addFeatures(features_tphcm2tphcm__boundary_administrative_tphcm_0);
var lyr_tphcm2tphcm__boundary_administrative_tphcm_0 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_tphcm2tphcm__boundary_administrative_tphcm_0, 
                style: style_tphcm2tphcm__boundary_administrative_tphcm_0,
                popuplayertitle: 'tphcm2 — tphcm__boundary_administrative_tphcm',
                interactive: true,
                title: '<img src="styles/legend/tphcm2tphcm__boundary_administrative_tphcm_0.png" /> tphcm2 — tphcm__boundary_administrative_tphcm'
            });
var format_coords_1 = new ol.format.GeoJSON();
var features_coords_1 = format_coords_1.readFeatures(json_coords_1, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_coords_1 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_coords_1.addFeatures(features_coords_1);
var lyr_coords_1 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_coords_1, 
                style: style_coords_1,
                popuplayertitle: 'coords',
                interactive: true,
                title: '<img src="styles/legend/coords_1.png" /> coords'
            });

lyr_tphcm2tphcm__boundary_administrative_tphcm_0.setVisible(true);lyr_coords_1.setVisible(true);
var layersList = [lyr_tphcm2tphcm__boundary_administrative_tphcm_0,lyr_coords_1];
lyr_tphcm2tphcm__boundary_administrative_tphcm_0.set('fieldAliases', {'fid': 'fid', 'full_id': 'full_id', 'osm_id': 'osm_id', 'osm_type': 'osm_type', 'boundary': 'boundary', 'place': 'place', 'wikivoyage': 'wikivoyage', 'wikipedia': 'wikipedia', 'wikidata': 'wikidata', 'type': 'type', 'short_name:vi': 'short_name:vi', 'short_name:en': 'short_name:en', 'short_name': 'short_name', 'ref': 'ref', 'population': 'population', 'old_name': 'old_name', 'name:zh-Hant': 'name:zh-Hant', 'name:zh-Hans': 'name:zh-Hans', 'name:zh': 'name:zh', 'name:vi-Hani': 'name:vi-Hani', 'name:vi': 'name:vi', 'name:th': 'name:th', 'name:sr': 'name:sr', 'name:sk': 'name:sk', 'name:ru': 'name:ru', 'name:nl': 'name:nl', 'name:ms': 'name:ms', 'name:ko': 'name:ko', 'name:ja': 'name:ja', 'name:hr': 'name:hr', 'name:fr': 'name:fr', 'name:eo': 'name:eo', 'name:en': 'name:en', 'name:cs': 'name:cs', 'name': 'name', 'is_in:country_code': 'is_in:country_code', 'alt_name:zh-Hant': 'alt_name:zh-Hant', 'alt_name:zh-Hans': 'alt_name:zh-Hans', 'alt_name:zh': 'alt_name:zh', 'alt_name:vi-Hani': 'alt_name:vi-Hani', 'alt_name:vi': 'alt_name:vi', 'alt_name:th': 'alt_name:th', 'alt_name:ru': 'alt_name:ru', 'alt_name:la': 'alt_name:la', 'alt_name:ko': 'alt_name:ko', 'alt_name:ja': 'alt_name:ja', 'alt_name:hr': 'alt_name:hr', 'alt_name:fr': 'alt_name:fr', 'alt_name:en': 'alt_name:en', 'alt_name:de': 'alt_name:de', 'alt_name:cs': 'alt_name:cs', 'alt_name': 'alt_name', 'admin_level': 'admin_level', 'ISO3166-2': 'ISO3166-2', });
lyr_coords_1.set('fieldAliases', {'name': 'name', 'latitude': 'latitude', 'longitude': 'longitude', });
lyr_tphcm2tphcm__boundary_administrative_tphcm_0.set('fieldImages', {'fid': '', 'full_id': '', 'osm_id': '', 'osm_type': '', 'boundary': '', 'place': '', 'wikivoyage': '', 'wikipedia': '', 'wikidata': '', 'type': '', 'short_name:vi': '', 'short_name:en': '', 'short_name': '', 'ref': '', 'population': '', 'old_name': '', 'name:zh-Hant': '', 'name:zh-Hans': '', 'name:zh': '', 'name:vi-Hani': '', 'name:vi': '', 'name:th': '', 'name:sr': '', 'name:sk': '', 'name:ru': '', 'name:nl': '', 'name:ms': '', 'name:ko': '', 'name:ja': '', 'name:hr': '', 'name:fr': '', 'name:eo': '', 'name:en': '', 'name:cs': '', 'name': '', 'is_in:country_code': '', 'alt_name:zh-Hant': '', 'alt_name:zh-Hans': '', 'alt_name:zh': '', 'alt_name:vi-Hani': '', 'alt_name:vi': '', 'alt_name:th': '', 'alt_name:ru': '', 'alt_name:la': '', 'alt_name:ko': '', 'alt_name:ja': '', 'alt_name:hr': '', 'alt_name:fr': '', 'alt_name:en': '', 'alt_name:de': '', 'alt_name:cs': '', 'alt_name': '', 'admin_level': '', 'ISO3166-2': '', });
lyr_coords_1.set('fieldImages', {'name': '', 'latitude': '', 'longitude': '', });
lyr_tphcm2tphcm__boundary_administrative_tphcm_0.set('fieldLabels', {'fid': 'no label', 'full_id': 'no label', 'osm_id': 'no label', 'osm_type': 'no label', 'boundary': 'no label', 'place': 'no label', 'wikivoyage': 'no label', 'wikipedia': 'no label', 'wikidata': 'no label', 'type': 'no label', 'short_name:vi': 'no label', 'short_name:en': 'no label', 'short_name': 'no label', 'ref': 'no label', 'population': 'no label', 'old_name': 'no label', 'name:zh-Hant': 'no label', 'name:zh-Hans': 'no label', 'name:zh': 'no label', 'name:vi-Hani': 'no label', 'name:vi': 'no label', 'name:th': 'no label', 'name:sr': 'no label', 'name:sk': 'no label', 'name:ru': 'no label', 'name:nl': 'no label', 'name:ms': 'no label', 'name:ko': 'no label', 'name:ja': 'no label', 'name:hr': 'no label', 'name:fr': 'no label', 'name:eo': 'no label', 'name:en': 'no label', 'name:cs': 'no label', 'name': 'no label', 'is_in:country_code': 'no label', 'alt_name:zh-Hant': 'no label', 'alt_name:zh-Hans': 'no label', 'alt_name:zh': 'no label', 'alt_name:vi-Hani': 'no label', 'alt_name:vi': 'no label', 'alt_name:th': 'no label', 'alt_name:ru': 'no label', 'alt_name:la': 'no label', 'alt_name:ko': 'no label', 'alt_name:ja': 'no label', 'alt_name:hr': 'no label', 'alt_name:fr': 'no label', 'alt_name:en': 'no label', 'alt_name:de': 'no label', 'alt_name:cs': 'no label', 'alt_name': 'no label', 'admin_level': 'no label', 'ISO3166-2': 'no label', });
lyr_coords_1.set('fieldLabels', {'name': 'inline label - visible with data', 'latitude': 'no label', 'longitude': 'no label', });
lyr_coords_1.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});
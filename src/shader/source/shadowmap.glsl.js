export default "@export clay.sm.depth.vertex\nuniform mat4 worldViewProjection : WORLDVIEWPROJECTION;\nattribute vec3 position : POSITION;\nattribute vec2 texcoord : TEXCOORD_0;\n@import clay.chunk.skinning_header\nvarying vec4 v_ViewPosition;\nvarying vec2 v_Texcoord;\nvoid main(){\n vec3 skinnedPosition = position;\n#ifdef SKINNING\n @import clay.chunk.skin_matrix\n skinnedPosition = (skinMatrixWS * vec4(position, 1.0)).xyz;\n#endif\n v_ViewPosition = worldViewProjection * vec4(skinnedPosition, 1.0);\n gl_Position = v_ViewPosition;\n v_Texcoord = texcoord;\n}\n@end\n@export clay.sm.depth.fragment\nvarying vec4 v_ViewPosition;\nvarying vec2 v_Texcoord;\nuniform float bias : 0.001;\nuniform float slopeScale : 1.0;\nuniform sampler2D alphaMap;\nuniform float alphaCutoff: 0.0;\n@import clay.util.encode_float\nvoid main(){\n float depth = v_ViewPosition.z / v_ViewPosition.w;\n#ifdef USE_VSM\n depth = depth * 0.5 + 0.5;\n float moment1 = depth;\n float moment2 = depth * depth;\n float dx = dFdx(depth);\n float dy = dFdy(depth);\n moment2 += 0.25*(dx*dx+dy*dy);\n gl_FragColor = vec4(moment1, moment2, 0.0, 1.0);\n#else\n float dx = dFdx(depth);\n float dy = dFdy(depth);\n depth += sqrt(dx*dx + dy*dy) * slopeScale + bias;\n if (alphaCutoff > 0.0) {\n if (texture2D(alphaMap, v_Texcoord).a <= alphaCutoff) {\n discard;\n }\n }\n gl_FragColor = encodeFloat(depth * 0.5 + 0.5);\n#endif\n}\n@end\n@export clay.sm.debug_depth\nuniform sampler2D depthMap;\nvarying vec2 v_Texcoord;\n@import clay.util.decode_float\nvoid main() {\n vec4 tex = texture2D(depthMap, v_Texcoord);\n#ifdef USE_VSM\n gl_FragColor = vec4(tex.rgb, 1.0);\n#else\n float depth = decodeFloat(tex);\n gl_FragColor = vec4(depth, depth, depth, 1.0);\n#endif\n}\n@end\n@export clay.sm.distance.vertex\nuniform mat4 worldViewProjection : WORLDVIEWPROJECTION;\nuniform mat4 world : WORLD;\nattribute vec3 position : POSITION;\n@import clay.chunk.skinning_header\nvarying vec3 v_WorldPosition;\nvoid main (){\n vec3 skinnedPosition = position;\n#ifdef SKINNING\n @import clay.chunk.skin_matrix\n skinnedPosition = (skinMatrixWS * vec4(position, 1.0)).xyz;\n#endif\n gl_Position = worldViewProjection * vec4(skinnedPosition , 1.0);\n v_WorldPosition = (world * vec4(skinnedPosition, 1.0)).xyz;\n}\n@end\n@export clay.sm.distance.fragment\nuniform vec3 lightPosition;\nuniform float range : 100;\nvarying vec3 v_WorldPosition;\n@import clay.util.encode_float\nvoid main(){\n float dist = distance(lightPosition, v_WorldPosition);\n#ifdef USE_VSM\n gl_FragColor = vec4(dist, dist * dist, 0.0, 0.0);\n#else\n dist = dist / range;\n gl_FragColor = encodeFloat(dist);\n#endif\n}\n@end\n@export clay.plugin.shadow_map_common\n@import clay.util.decode_float\nfloat tapShadowMap(sampler2D map, vec2 uv, float z){\n vec4 tex = texture2D(map, uv);\n return step(z, decodeFloat(tex) * 2.0 - 1.0);\n}\nfloat pcf(sampler2D map, vec2 uv, float z, float textureSize, vec2 scale) {\n float shadowContrib = tapShadowMap(map, uv, z);\n vec2 offset = vec2(1.0 / textureSize) * scale;\n#ifdef PCF_KERNEL_SIZE\n for (int _idx_ = 0; _idx_ < PCF_KERNEL_SIZE; _idx_++) {{\n shadowContrib += tapShadowMap(map, uv + offset * pcfKernel[_idx_], z);\n }}\n return shadowContrib / float(PCF_KERNEL_SIZE + 1);\n#else\n shadowContrib += tapShadowMap(map, uv+vec2(offset.x, 0.0), z);\n shadowContrib += tapShadowMap(map, uv+vec2(offset.x, offset.y), z);\n shadowContrib += tapShadowMap(map, uv+vec2(-offset.x, offset.y), z);\n shadowContrib += tapShadowMap(map, uv+vec2(0.0, offset.y), z);\n shadowContrib += tapShadowMap(map, uv+vec2(-offset.x, 0.0), z);\n shadowContrib += tapShadowMap(map, uv+vec2(-offset.x, -offset.y), z);\n shadowContrib += tapShadowMap(map, uv+vec2(offset.x, -offset.y), z);\n shadowContrib += tapShadowMap(map, uv+vec2(0.0, -offset.y), z);\n return shadowContrib / 9.0;\n#endif\n}\nfloat pcf(sampler2D map, vec2 uv, float z, float textureSize) {\n return pcf(map, uv, z, textureSize, vec2(1.0));\n}\nfloat chebyshevUpperBound(vec2 moments, float z){\n float p = 0.0;\n z = z * 0.5 + 0.5;\n if (z <= moments.x) {\n p = 1.0;\n }\n float variance = moments.y - moments.x * moments.x;\n variance = max(variance, 0.0000001);\n float mD = moments.x - z;\n float pMax = variance / (variance + mD * mD);\n pMax = clamp((pMax-0.4)/(1.0-0.4), 0.0, 1.0);\n return max(p, pMax);\n}\nfloat computeShadowContrib(\n sampler2D map, mat4 lightVPM, vec3 position, float textureSize, vec2 scale, vec2 offset\n) {\n vec4 posInLightSpace = lightVPM * vec4(position, 1.0);\n posInLightSpace.xyz /= posInLightSpace.w;\n float z = posInLightSpace.z;\n if(all(greaterThan(posInLightSpace.xyz, vec3(-0.99, -0.99, -1.0))) &&\n all(lessThan(posInLightSpace.xyz, vec3(0.99, 0.99, 1.0)))){\n vec2 uv = (posInLightSpace.xy+1.0) / 2.0;\n #ifdef USE_VSM\n vec2 moments = texture2D(map, uv * scale + offset).xy;\n return chebyshevUpperBound(moments, z);\n #else\n return pcf(map, uv * scale + offset, z, textureSize, scale);\n #endif\n }\n return 1.0;\n}\nfloat computeShadowContrib(sampler2D map, mat4 lightVPM, vec3 position, float textureSize) {\n return computeShadowContrib(map, lightVPM, position, textureSize, vec2(1.0), vec2(0.0));\n}\nfloat computeShadowContribOmni(samplerCube map, vec3 direction, float range)\n{\n float dist = length(direction);\n vec4 shadowTex = textureCube(map, direction);\n#ifdef USE_VSM\n vec2 moments = shadowTex.xy;\n float variance = moments.y - moments.x * moments.x;\n float mD = moments.x - dist;\n float p = variance / (variance + mD * mD);\n if(moments.x + 0.001 < dist){\n return clamp(p, 0.0, 1.0);\n }else{\n return 1.0;\n }\n#else\n return step(dist, (decodeFloat(shadowTex) + 0.0002) * range);\n#endif\n}\n@end\n@export clay.plugin.compute_shadow_map\n#if defined(SPOT_LIGHT_SHADOWMAP_COUNT) || defined(DIRECTIONAL_LIGHT_SHADOWMAP_COUNT) || defined(POINT_LIGHT_SHADOWMAP_COUNT)\n#ifdef SPOT_LIGHT_SHADOWMAP_COUNT\nuniform sampler2D spotLightShadowMaps[SPOT_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\nuniform mat4 spotLightMatrices[SPOT_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\nuniform float spotLightShadowMapSizes[SPOT_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\n#endif\n#ifdef DIRECTIONAL_LIGHT_SHADOWMAP_COUNT\n#if defined(SHADOW_CASCADE)\nuniform sampler2D directionalLightShadowMaps[1]:unconfigurable;\nuniform mat4 directionalLightMatrices[SHADOW_CASCADE]:unconfigurable;\nuniform float directionalLightShadowMapSizes[1]:unconfigurable;\nuniform float shadowCascadeClipsNear[SHADOW_CASCADE]:unconfigurable;\nuniform float shadowCascadeClipsFar[SHADOW_CASCADE]:unconfigurable;\n#else\nuniform sampler2D directionalLightShadowMaps[DIRECTIONAL_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\nuniform mat4 directionalLightMatrices[DIRECTIONAL_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\nuniform float directionalLightShadowMapSizes[DIRECTIONAL_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\n#endif\n#endif\n#ifdef POINT_LIGHT_SHADOWMAP_COUNT\nuniform samplerCube pointLightShadowMaps[POINT_LIGHT_SHADOWMAP_COUNT]:unconfigurable;\n#endif\nuniform bool shadowEnabled : true;\n#ifdef PCF_KERNEL_SIZE\nuniform vec2 pcfKernel[PCF_KERNEL_SIZE];\n#endif\n@import clay.plugin.shadow_map_common\n#if defined(SPOT_LIGHT_SHADOWMAP_COUNT)\nvoid computeShadowOfSpotLights(vec3 position, inout float shadowContribs[SPOT_LIGHT_COUNT] ) {\n float shadowContrib;\n for(int _idx_ = 0; _idx_ < SPOT_LIGHT_SHADOWMAP_COUNT; _idx_++) {{\n shadowContrib = computeShadowContrib(\n spotLightShadowMaps[_idx_], spotLightMatrices[_idx_], position,\n spotLightShadowMapSizes[_idx_]\n );\n shadowContribs[_idx_] = shadowContrib;\n }}\n for(int _idx_ = SPOT_LIGHT_SHADOWMAP_COUNT; _idx_ < SPOT_LIGHT_COUNT; _idx_++){{\n shadowContribs[_idx_] = 1.0;\n }}\n}\n#endif\n#if defined(DIRECTIONAL_LIGHT_SHADOWMAP_COUNT)\n#ifdef SHADOW_CASCADE\nvoid computeShadowOfDirectionalLights(vec3 position, inout float shadowContribs[DIRECTIONAL_LIGHT_COUNT]){\n float depth = (2.0 * gl_FragCoord.z - gl_DepthRange.near - gl_DepthRange.far)\n / (gl_DepthRange.far - gl_DepthRange.near);\n float shadowContrib;\n shadowContribs[0] = 1.0;\n for (int _idx_ = 0; _idx_ < SHADOW_CASCADE; _idx_++) {{\n if (\n depth >= shadowCascadeClipsNear[_idx_] &&\n depth <= shadowCascadeClipsFar[_idx_]\n ) {\n shadowContrib = computeShadowContrib(\n directionalLightShadowMaps[0], directionalLightMatrices[_idx_], position,\n directionalLightShadowMapSizes[0],\n vec2(1.0 / float(SHADOW_CASCADE), 1.0),\n vec2(float(_idx_) / float(SHADOW_CASCADE), 0.0)\n );\n shadowContribs[0] = shadowContrib;\n }\n }}\n for(int _idx_ = DIRECTIONAL_LIGHT_SHADOWMAP_COUNT; _idx_ < DIRECTIONAL_LIGHT_COUNT; _idx_++) {{\n shadowContribs[_idx_] = 1.0;\n }}\n}\n#else\nvoid computeShadowOfDirectionalLights(vec3 position, inout float shadowContribs[DIRECTIONAL_LIGHT_COUNT]){\n float shadowContrib;\n for(int _idx_ = 0; _idx_ < DIRECTIONAL_LIGHT_SHADOWMAP_COUNT; _idx_++) {{\n shadowContrib = computeShadowContrib(\n directionalLightShadowMaps[_idx_], directionalLightMatrices[_idx_], position,\n directionalLightShadowMapSizes[_idx_]\n );\n shadowContribs[_idx_] = shadowContrib;\n }}\n for(int _idx_ = DIRECTIONAL_LIGHT_SHADOWMAP_COUNT; _idx_ < DIRECTIONAL_LIGHT_COUNT; _idx_++) {{\n shadowContribs[_idx_] = 1.0;\n }}\n}\n#endif\n#endif\n#if defined(POINT_LIGHT_SHADOWMAP_COUNT)\nvoid computeShadowOfPointLights(vec3 position, inout float shadowContribs[POINT_LIGHT_COUNT] ){\n vec3 lightPosition;\n vec3 direction;\n for(int _idx_ = 0; _idx_ < POINT_LIGHT_SHADOWMAP_COUNT; _idx_++) {{\n lightPosition = pointLightPosition[_idx_];\n direction = position - lightPosition;\n shadowContribs[_idx_] = computeShadowContribOmni(pointLightShadowMaps[_idx_], direction, pointLightRange[_idx_]);\n }}\n for(int _idx_ = POINT_LIGHT_SHADOWMAP_COUNT; _idx_ < POINT_LIGHT_COUNT; _idx_++) {{\n shadowContribs[_idx_] = 1.0;\n }}\n}\n#endif\n#endif\n@end";

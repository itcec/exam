/* esm.sh - @firecms/neat@1.0.2 */
var gt=`void main() {
vUv = uv;
vPosition = position;
float waveOffset = -u_y_offset * u_y_offset_wave_multiplier;
float colorOffset = -u_y_offset * u_y_offset_color_multiplier;
float flowOffset = -u_y_offset * u_y_offset_flow_multiplier;
v_displacement_amount = cnoise( vec3(
u_wave_frequency_x * position.x + u_time,
u_wave_frequency_y * (position.y + waveOffset) + u_time,
u_time
));
vec2 baseUv = vUv;
baseUv.y += flowOffset / u_plane_height;
vec2 flowUv = baseUv;
if (u_flow_enabled > 0.5) {
if (u_flow_ease > 0.0 || u_flow_distortion_a > 0.0) {
vec2 ppp = -1.0 + 2.0 * baseUv;
ppp += 0.1 * cos((1.5 * u_flow_scale) * ppp.yx + 1.1 * u_time + vec2(0.1, 1.1));
ppp += 0.1 * cos((2.3 * u_flow_scale) * ppp.yx + 1.3 * u_time + vec2(3.2, 3.4));
ppp += 0.1 * cos((2.2 * u_flow_scale) * ppp.yx + 1.7 * u_time + vec2(1.8, 5.2));
ppp += u_flow_distortion_a * cos((u_flow_distortion_b * u_flow_scale) * ppp.yx + 1.4 * u_time + vec2(6.3, 3.9));
float r = length(ppp);
flowUv = mix(baseUv, vec2(baseUv.x * (1.0 - u_flow_ease) + r * u_flow_ease, baseUv.y), u_flow_ease);
}
}
vFlowUv = flowUv;
vec3 color = u_colors[0].color;
vec3 distortedPos = position;
if (u_flat_shading < 0.5) {
if (u_flow_enabled > 0.5) {
if (u_flow_ease > 0.0 || u_flow_distortion_a > 0.0) {
vec3 ppp = position / 25.0;
ppp.xyz += 0.1 * cos((1.5 * u_flow_scale) * ppp.yxz + 1.1 * u_time + vec3(0.1, 1.1, 2.1));
ppp.xyz += 0.1 * cos((2.3 * u_flow_scale) * ppp.zxy + 1.3 * u_time + vec3(3.2, 3.4, 1.2));
ppp.xyz += 0.1 * cos((2.2 * u_flow_scale) * ppp.yxz + 1.7 * u_time + vec3(1.8, 5.2, 3.1));
ppp.xyz += u_flow_distortion_a * cos((u_flow_distortion_b * u_flow_scale) * ppp.zxy + 1.4 * u_time + vec3(6.3, 3.9, 4.5));
float r = length(ppp);
distortedPos = mix(position, vec3(
position.x * (1.0 - u_flow_ease) + r * u_flow_ease * 25.0,
position.y,
position.z * (1.0 - u_flow_ease) + r * u_flow_ease * 25.0
), u_flow_ease);
}
}
}
vec3 noise_cord;
if (u_flat_shading < 0.5) {
noise_cord = vec3(distortedPos.x / 50.0, (distortedPos.y + colorOffset) / 50.0, distortedPos.z / 50.0);
} else {
vec2 adjustedUv = flowUv;
adjustedUv.y += colorOffset / u_plane_height;
noise_cord = vec3(adjustedUv, 0.0);
}
const float minNoise = .0;
const float maxNoise = .9;
for (int i = 1; i < 6; i++) {
if (i < u_colors_count) {
if (u_colors[i].is_active > 0.5) {
float noiseFlow = (1. + float(i)) / 30.;
float noiseSpeed = (1. + float(i)) * 0.11;
float noiseSeed = 13. + float(i) * 7.;
float noise_z = u_time * noiseSpeed;
if (u_flat_shading < 0.5) {
noise_z = noise_cord.z * u_color_pressure.x * u_color_pressure.x + u_time * noiseSpeed;
}
float noise = snoise(
vec3(
noise_cord.x * u_color_pressure.x * u_color_pressure.x + u_time * noiseFlow * 2.,
noise_cord.y * u_color_pressure.y * u_color_pressure.y,
noise_z
) + noiseSeed
) - (.1 * float(i)) + (.5 * u_color_blending);
noise = clamp(noise, minNoise, maxNoise + float(i) * 0.02);
color = mix(color, u_colors[i].color, smoothstep(0.0, u_color_blending, noise));
}
}
}
v_color = color;
vec3 newPosition = position + normal * v_displacement_amount * u_wave_amplitude;
vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
vViewPosition = mvPosition.xyz;
vNormal = normalize((modelViewMatrix * vec4(normal, 0.0)).xyz);
gl_Position = projectionMatrix * mvPosition;
v_new_position = gl_Position;
}`,vt=`float random(vec2 p) {
return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}
float fbm(vec3 x) {
float value = 0.0;
float amplitude = 0.5;
float frequency = 1.0;
for (int i = 0; i < 2; i++) {
value += amplitude * snoise(x * frequency);
frequency *= 2.0;
amplitude *= 0.5;
}
return value;
}
vec3 hsl2rgb(float h, float s, float l) {
vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
void main() {
vec2 finalUv = vFlowUv;
vec3 baseColor;
float texAlpha = 1.0;
if (u_enable_procedural_texture > 0.5) {
if (u_flat_shading < 0.5) {
float parallaxFactor = 0.25;
float scrollOffset = (u_y_offset * u_y_offset_color_multiplier) * parallaxFactor;
vec3 scrolledPos = vPosition;
scrolledPos.y -= scrollOffset;
vec3 p = (scrolledPos * 1.5) / 50.0;
vec2 uvX = p.yz + vec2(0.5);
vec2 uvY = p.zx + vec2(0.5);
vec2 uvZ = p.xy + vec2(0.5);
vec4 colX = texture2D(u_procedural_texture, uvX);
vec4 colY = texture2D(u_procedural_texture, uvY);
vec4 colZ = texture2D(u_procedural_texture, uvZ);
vec3 n = normalize(vNormal);
vec3 blendWeights = abs(n);
blendWeights = blendWeights / (blendWeights.x + blendWeights.y + blendWeights.z + 0.0001);
vec4 texSample = colX * blendWeights.x + colY * blendWeights.y + colZ * blendWeights.z;
baseColor = texSample.rgb;
if (u_transparent_texture_void > 0.5) {
texAlpha = texSample.a;
}
} else {
vec2 ppp = -1.0 + 2.0 * finalUv;
ppp += 0.1 * cos((1.5 * u_flow_scale) * ppp.yx + 1.1 * u_time + vec2(0.1, 1.1));
ppp += 0.1 * cos((2.3 * u_flow_scale) * ppp.yx + 1.3 * u_time + vec2(3.2, 3.4));
ppp += 0.1 * cos((2.2 * u_flow_scale) * ppp.yx + 1.7 * u_time + vec2(1.8, 5.2));
ppp += u_flow_distortion_a * cos((u_flow_distortion_b * u_flow_scale) * ppp.yx + 1.4 * u_time + vec2(6.3, 3.9));
float r = length(ppp);
float vx = (finalUv.x * u_texture_ease) + (r * (1.0 - u_texture_ease));
float vy = (finalUv.y * u_texture_ease) + (0.0 * (1.0 - u_texture_ease));
vec2 texUv = vec2(vx, vy);
float parallaxFactor = 0.25;
texUv.y -= (u_y_offset * u_y_offset_color_multiplier / u_plane_height) * parallaxFactor;
texUv *= 1.5;
vec4 texSample = texture2D(u_procedural_texture, texUv);
baseColor = texSample.rgb;
if (u_transparent_texture_void > 0.5) {
texAlpha = texSample.a;
}
}
} else {
baseColor = v_color;
}
vec3 color = baseColor;
if (u_domain_warp_enabled > 0.5) {
vec3 p;
if (u_flat_shading < 0.5) {
p = vec3((vPosition / 50.0 + vec3(0.5)) * u_domain_warp_scale);
p.z += u_time * 0.15;
} else {
p = vec3(finalUv * u_domain_warp_scale, u_time * 0.15);
}
vec2 q = vec2(fbm(p), fbm(p + vec3(5.2, 1.3, 0.0)));
float f = fbm(p + vec3(4.0 * q, 0.0));
vec3 warpColor = color * (1.0 + f * 0.8 * u_domain_warp_intensity);
float pattern = clamp(f * f * f + 0.6 * f * f + 0.5 * f, 0.0, 1.0);
color = mix(color, warpColor * (0.6 + pattern * 0.8), u_domain_warp_intensity * 0.7);
}
vec3 normal = normalize(vNormal);
vec3 viewDir = vec3(0.0, 0.0, 1.0);
float ndotv = dot(normal, viewDir);
if (u_shape_type > 0.5 && u_shape_type < 3.5) {
if (ndotv < 0.0) {
discard;
}
} else {
if (ndotv < 0.0) {
normal = -normal;
ndotv = -ndotv;
}
}
vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
float diffuse = max(dot(normal, lightDir), 0.0);
vec3 halfDir = normalize(lightDir + viewDir);
float specular = pow(max(dot(normal, halfDir), 0.0), 32.0);
if (u_flat_shading > 0.5) {
color += v_displacement_amount * u_highlights;
float heightShadow = 1.0 - v_displacement_amount;
color -= heightShadow * heightShadow * u_shadows;
} else {
color += specular * u_highlights;
color += v_displacement_amount * u_highlights * 0.5;
float heightShadow = 1.0 - v_displacement_amount;
color -= heightShadow * heightShadow * u_shadows * 0.5;
color -= (1.0 - diffuse) * u_shadows * 0.5;
}
color = saturation(color, 1.0 + u_saturation);
color = color * u_brightness;
if (u_iridescence_enabled > 0.5) {
float hue = fract(v_displacement_amount * 0.5 + 0.5 + u_time * u_iridescence_speed * 0.05);
vec3 iriColor = hsl2rgb(hue, 0.8, 0.6);
color = mix(color, iriColor, u_iridescence_intensity * abs(v_displacement_amount) * 0.6);
}
if (u_fresnel_enabled > 0.5) {
float slope = 1.0 - abs(v_displacement_amount);
float fresnel = pow(max(slope, 0.0), u_fresnel_power);
color += u_fresnel_color * fresnel * u_fresnel_intensity;
}
if (u_vignette_intensity > 0.0) {
vec2 vigUv = vUv;
if (u_flat_shading < 0.5) {
vigUv = (v_new_position.xy / v_new_position.w) * 0.5 + vec2(0.5);
}
float dist = length(vigUv - vec2(0.5));
float vig = smoothstep(u_vignette_radius, u_vignette_radius * 0.3, dist);
color *= mix(1.0, vig, u_vignette_intensity);
}
if (u_bloom_intensity > 0.0) {
float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
float bloomMask = smoothstep(u_bloom_threshold, 1.0, luma);
color += color * bloomMask * u_bloom_intensity;
}
if (u_chromatic_aberration > 0.0) {
float caAmount = u_chromatic_aberration * 0.008;
vec2 caUv = vUv;
if (u_flat_shading < 0.5) {
caUv = (v_new_position.xy / v_new_position.w) * 0.5 + vec2(0.5);
}
float dist = length(caUv - vec2(0.5));
float rShift = v_displacement_amount + caAmount * dist;
float bShift = v_displacement_amount - caAmount * dist;
color.r *= 1.0 + rShift * caAmount * 10.0;
color.b *= 1.0 - bShift * caAmount * 10.0;
}
float grain = 0.0;
if (u_grain_intensity > 0.0) {
vec2 noiseCoords = gl_FragCoord.xy / u_grain_scale;
if (u_grain_speed != 0.0 || u_flat_shading > 0.5) {
grain = fbm(vec3(noiseCoords, u_time * u_grain_speed));
} else {
grain = random(noiseCoords) - 0.5;
}
grain = grain * 0.5 + 0.5;
grain -= 0.5;
grain = (grain > u_grain_sparsity) ? grain : 0.0;
grain *= u_grain_intensity;
}
color += vec3(grain);
float edgeAlpha = 1.0;
if (u_silhouette_fade > 0.0 && u_flat_shading < 0.5) {
edgeAlpha = smoothstep(0.0, u_silhouette_fade, ndotv);
}
if (u_shape_type == 3.0) {
float vFade = smoothstep(0.0, u_cylinder_fade, vUv.y) * smoothstep(1.0, 1.0 - u_cylinder_fade, vUv.y);
edgeAlpha *= vFade;
} else if (u_shape_type == 4.0) {
float uFade = smoothstep(0.0, u_ribbon_fade, vUv.x) * smoothstep(1.0, 1.0 - u_ribbon_fade, vUv.x);
float vFade = smoothstep(0.0, u_ribbon_fade, vUv.y) * smoothstep(1.0, 1.0 - u_ribbon_fade, vUv.y);
edgeAlpha *= uFade * vFade;
}
edgeAlpha *= texAlpha;
gl_FragColor = vec4(color, edgeAlpha);
}`;function yt(){return`precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec2 vUv;
varying vec2 vFlowUv;
varying vec4 v_new_position;
varying vec3 v_color;
varying float v_displacement_amount;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec3 vPosition;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_color_pressure;
uniform float u_wave_frequency_x;
uniform float u_wave_frequency_y;
uniform float u_wave_amplitude;
uniform float u_plane_width;
uniform float u_plane_height;
uniform float u_color_blending;
uniform int u_colors_count;
struct ColorStop {
float is_active;
vec3 color;
float influence;
};
uniform ColorStop u_colors[6];
uniform float u_y_offset;
uniform float u_y_offset_wave_multiplier;
uniform float u_y_offset_color_multiplier;
uniform float u_y_offset_flow_multiplier;
uniform float u_flow_distortion_a;
uniform float u_flow_distortion_b;
uniform float u_flow_scale;
uniform float u_flow_ease;
uniform float u_flow_enabled;
uniform float u_fresnel_enabled;
uniform float u_fresnel_power;
uniform float u_fresnel_intensity;
uniform vec3 u_fresnel_color;
uniform float u_shape_type;
uniform float u_flat_shading;`}function xt(){return`precision highp float;
varying vec2 vUv;
varying vec2 vFlowUv;
varying vec4 v_new_position;
varying vec3 v_color;
varying float v_displacement_amount;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec3 vPosition;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_plane_height;
uniform float u_shadows;
uniform float u_highlights;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_grain_intensity;
uniform float u_grain_sparsity;
uniform float u_grain_scale;
uniform float u_grain_speed;
uniform float u_y_offset;
uniform float u_y_offset_color_multiplier;
uniform float u_flow_distortion_a;
uniform float u_flow_distortion_b;
uniform float u_flow_scale;
uniform sampler2D u_procedural_texture;
uniform float u_enable_procedural_texture;
uniform float u_texture_ease;
uniform float u_domain_warp_enabled;
uniform float u_domain_warp_intensity;
uniform float u_domain_warp_scale;
uniform float u_vignette_intensity;
uniform float u_vignette_radius;
uniform float u_fresnel_enabled;
uniform float u_fresnel_power;
uniform float u_fresnel_intensity;
uniform vec3 u_fresnel_color;
uniform float u_iridescence_enabled;
uniform float u_iridescence_intensity;
uniform float u_iridescence_speed;
uniform float u_bloom_intensity;
uniform float u_bloom_threshold;
uniform float u_chromatic_aberration;
uniform float u_shape_type;
uniform float u_transparent_texture_void;
uniform float u_silhouette_fade;
uniform float u_cylinder_fade;
uniform float u_ribbon_fade;
uniform float u_flat_shading;`}function ae(){return`vec4 permute(vec4 x) {
return floor(fract(sin(x) * 43758.5453123) * 289.0);
}
vec4 taylorInvSqrt(vec4 r) {
return 1.79284291400159 - 0.85373472095314 * r;
}
vec3 fade(vec3 t) {
return t*t*t*(t*(t*6.0-15.0)+10.0);
}
float snoise(vec3 v) {
const vec2 C = vec2(1.0/6.0, 1.0/3.0) ;
const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
vec3 i = floor(v + dot(v, C.yyy) );
vec3 x0 = v - i + dot(i, C.xxx) ;
vec3 g = step(x0.yzx, x0.xyz);
vec3 l = 1.0 - g;
vec3 i1 = min( g.xyz, l.zxy );
vec3 i2 = max( g.xyz, l.zxy );
vec3 x1 = x0 - i1 + C.xxx;
vec3 x2 = x0 - i2 + C.yyy;
vec3 x3 = x0 - D.yyy;
vec4 p = permute( permute( permute(
i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
+ i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
+ i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
float n_ = 0.142857142857;
vec3 ns = n_ * D.wyz - D.xzx;
vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
vec4 x_ = floor(j * ns.z);
vec4 y_ = floor(j - 7.0 * x_ );
vec4 x = x_ *ns.x + ns.yyyy;
vec4 y = y_ *ns.x + ns.yyyy;
vec4 h = 1.0 - abs(x) - abs(y);
vec4 b0 = vec4( x.xy, y.xy );
vec4 b1 = vec4( x.zw, y.zw );
vec4 s0 = floor(b0)*2.0 + 1.0;
vec4 s1 = floor(b1)*2.0 + 1.0;
vec4 sh = -step(h, vec4(0.0));
vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
vec3 p0 = vec3(a0.xy,h.x);
vec3 p1 = vec3(a0.zw,h.y);
vec3 p2 = vec3(a1.xy,h.z);
vec3 p3 = vec3(a1.zw,h.w);
vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
p0 *= norm.x;
p1 *= norm.y;
p2 *= norm.z;
p3 *= norm.w;
vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
m = m * m;
return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
dot(p2,x2), dot(p3,x3) ) );
}
float cnoise(vec3 P)
{
vec3 Pi0 = floor(P);
vec3 Pi1 = Pi0 + vec3(1.0);
vec3 Pf0 = fract(P);
vec3 Pf1 = Pf0 - vec3(1.0);
vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
vec4 iy = vec4(Pi0.yy, Pi1.yy);
vec4 iz0 = Pi0.zzzz;
vec4 iz1 = Pi1.zzzz;
vec4 ixy = permute(permute(ix) + iy);
vec4 ixy0 = permute(ixy + iz0);
vec4 ixy1 = permute(ixy + iz1);
vec4 gx0 = ixy0 * (1.0 / 7.0);
vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
gx0 = fract(gx0);
vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
vec4 sz0 = step(gz0, vec4(0.0));
gx0 -= sz0 * (step(0.0, gx0) - 0.5);
gy0 -= sz0 * (step(0.0, gy0) - 0.5);
vec4 gx1 = ixy1 * (1.0 / 7.0);
vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
gx1 = fract(gx1);
vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
vec4 sz1 = step(gz1, vec4(0.0));
gx1 -= sz1 * (step(0.0, gx1) - 0.5);
gy1 -= sz1 * (step(0.0, gy1) - 0.5);
vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
g000 *= norm0.x;
g010 *= norm0.y;
g100 *= norm0.z;
g110 *= norm0.w;
vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
g001 *= norm1.x;
g011 *= norm1.y;
g101 *= norm1.z;
g111 *= norm1.w;
float n000 = dot(g000, Pf0);
float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
float n111 = dot(g111, Pf1);
vec3 fade_xyz = fade(Pf0);
vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
return 2.2 * n_xyz;
}`}function le(){return`vec3 saturation(vec3 rgb, float adjustment) {
const vec3 W = vec3(0.2125, 0.7154, 0.0721);
vec3 intensity = vec3(dot(rgb, W));
return mix(intensity, rgb, adjustment);
}`}var $=class{elements;constructor(){this.elements=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}identity(){let e=this.elements;return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=1,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=1,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}translate(e,r,i){return this.elements[12]+=this.elements[0]*e+this.elements[4]*r+this.elements[8]*i,this.elements[13]+=this.elements[1]*e+this.elements[5]*r+this.elements[9]*i,this.elements[14]+=this.elements[2]*e+this.elements[6]*r+this.elements[10]*i,this.elements[15]+=this.elements[3]*e+this.elements[7]*r+this.elements[11]*i,this}rotateX(e){let r=Math.cos(e),i=Math.sin(e),l=this.elements[4],t=this.elements[5],o=this.elements[6],_=this.elements[7],n=this.elements[8],p=this.elements[9],y=this.elements[10],h=this.elements[11];return this.elements[4]=r*l+i*n,this.elements[5]=r*t+i*p,this.elements[6]=r*o+i*y,this.elements[7]=r*_+i*h,this.elements[8]=r*n-i*l,this.elements[9]=r*p-i*t,this.elements[10]=r*y-i*o,this.elements[11]=r*h-i*_,this}rotateY(e){let r=Math.cos(e),i=Math.sin(e),l=this.elements[0],t=this.elements[1],o=this.elements[2],_=this.elements[3],n=this.elements[8],p=this.elements[9],y=this.elements[10],h=this.elements[11];return this.elements[0]=r*l-i*n,this.elements[1]=r*t-i*p,this.elements[2]=r*o-i*y,this.elements[3]=r*_-i*h,this.elements[8]=i*l+r*n,this.elements[9]=i*t+r*p,this.elements[10]=i*o+r*y,this.elements[11]=i*_+r*h,this}rotateZ(e){let r=Math.cos(e),i=Math.sin(e),l=this.elements[0],t=this.elements[1],o=this.elements[2],_=this.elements[3],n=this.elements[4],p=this.elements[5],y=this.elements[6],h=this.elements[7];return this.elements[0]=r*l+i*n,this.elements[1]=r*t+i*p,this.elements[2]=r*o+i*y,this.elements[3]=r*_+i*h,this.elements[4]=-i*l+r*n,this.elements[5]=-i*t+r*p,this.elements[6]=-i*o+r*y,this.elements[7]=-i*_+r*h,this}},ee=class{left;right;top;bottom;near;far;position;projectionMatrix;zoom;constructor(e,r,i,l,t,o){this.left=e,this.right=r,this.top=i,this.bottom=l,this.near=t,this.far=o,this.position=[0,0,0],this.zoom=1,this.projectionMatrix=new $,this.updateProjectionMatrix()}updateProjectionMatrix(){let e=1/(this.right-this.left),r=1/(this.top-this.bottom),i=1/(this.far-this.near),l=(this.right+this.left)*e,t=(this.top+this.bottom)*r,o=(this.far+this.near)*i;this.projectionMatrix.elements=new Float32Array([2*e,0,0,0,0,2*r,0,0,0,0,-2*i,0,-l,-t,-o,1])}};function Z(d,e,r,i=50,l=50,t="plane",o=1){d.zoom=o;let _=e/r;if(t==="plane"){let n=e*r/1e6*i*l/1.5,p=Math.sqrt(n*_),y=n/p,h=-i/2,f=Math.min((h+p)/1.5,i/2),b=l/4,a=Math.max((b-y)/2,-l/4);if(_<1){let g=_;h=h*g,f=f*g;let R=1.05;h=h*R,f=f*R,b=b*R,a=a*R}d.left=h,d.right=f,d.top=b,d.bottom=a}else{let n=25;if(t==="sphere"?n=30:t==="torus"?n=35:t==="cylinder"&&(n=30),_>=1)d.left=-n*_,d.right=n*_,d.top=n,d.bottom=-n;else{d.left=-n,d.right=n,d.top=n/_,d.bottom=-n/_;let p=1.05;d.left*=p,d.right*=p,d.top*=p,d.bottom*=p}}d.left/=o,d.right/=o,d.top/=o,d.bottom/=o,d.near=-100,d.far=1e3,d.updateProjectionMatrix()}function _e(d,e,r,i){let l=d/2,t=e/2,o=Math.floor(r),_=Math.floor(i),n=o+1,p=_+1,y=d/o,h=e/_,f=[],b=[],a=[],g=[];for(let w=0;w<p;w++){let A=w*h-t;for(let x=0;x<n;x++){let c=x*y-l;b.push(c,-A,0),a.push(0,0,1),g.push(x/o),g.push(1-w/_)}}for(let w=0;w<_;w++)for(let A=0;A<o;A++){let x=A+n*w,c=A+n*(w+1),S=A+1+n*(w+1),u=A+1+n*w;f.push(x,c,u),f.push(c,S,u)}let R=b.length/3>65535,v=[];for(let w=0;w<f.length;w+=3){let A=f[w],x=f[w+1],c=f[w+2];v.push(A,x,x,c,c,A)}return{position:new Float32Array(b),normal:new Float32Array(a),uv:new Float32Array(g),index:R?new Uint32Array(f):new Uint16Array(f),wireframeIndex:R?new Uint32Array(v):new Uint16Array(v)}}function ue(d,e,r){let i=[],l=[],t=[],o=[],_=Math.floor(e),n=Math.floor(r);for(let h=0;h<=n;h++){let f=h/n,b=f*Math.PI;for(let a=0;a<=_;a++){let g=a/_,R=g*Math.PI*2,v=-d*Math.sin(b)*Math.cos(R),w=d*Math.cos(b),A=d*Math.sin(b)*Math.sin(R);i.push(v,w,A);let x=Math.sqrt(v*v+w*w+A*A);l.push(v/x,w/x,A/x),t.push(g,1-f)}}for(let h=0;h<n;h++)for(let f=0;f<_;f++){let b=f+(_+1)*h,a=f+(_+1)*(h+1),g=f+1+(_+1)*(h+1),R=f+1+(_+1)*h;o.push(b,a,R),o.push(a,g,R)}let p=i.length/3>65535,y=[];for(let h=0;h<o.length;h+=3){let f=o[h],b=o[h+1],a=o[h+2];y.push(f,b,b,a,a,f)}return{position:new Float32Array(i),normal:new Float32Array(l),uv:new Float32Array(t),index:p?new Uint32Array(o):new Uint16Array(o),wireframeIndex:p?new Uint32Array(y):new Uint16Array(y)}}function fe(d,e,r,i){let l=[],t=[],o=[],_=[],n=Math.floor(r),p=Math.floor(i);for(let f=0;f<=n;f++){let b=f/n*Math.PI*2;for(let a=0;a<=p;a++){let g=a/p*Math.PI*2,R=(d+e*Math.cos(b))*Math.cos(g),v=(d+e*Math.cos(b))*Math.sin(g),w=e*Math.sin(b);l.push(R,v,w);let A=d*Math.cos(g),x=d*Math.sin(g),c=R-A,S=v-x,u=w,T=Math.sqrt(c*c+S*S+u*u);t.push(c/T,S/T,u/T),o.push(a/p,f/n)}}for(let f=1;f<=n;f++)for(let b=1;b<=p;b++){let a=(p+1)*f+b-1,g=(p+1)*(f-1)+b-1,R=(p+1)*(f-1)+b,v=(p+1)*f+b;_.push(a,g,v),_.push(g,R,v)}let y=l.length/3>65535,h=[];for(let f=0;f<_.length;f+=3){let b=_[f],a=_[f+1],g=_[f+2];h.push(b,a,a,g,g,b)}return{position:new Float32Array(l),normal:new Float32Array(t),uv:new Float32Array(o),index:y?new Uint32Array(_):new Uint16Array(_),wireframeIndex:y?new Uint32Array(h):new Uint16Array(h)}}function ce(d,e,r,i,l){let t=[],o=[],_=[],n=[],p=Math.floor(i),y=Math.floor(l),h=r/2;for(let a=0;a<=y;a++){let g=a/y,R=g*r-h,v=g*(e-d)+d;for(let w=0;w<=p;w++){let A=w/p,x=A*Math.PI*2,c=Math.sin(x),S=Math.cos(x);t.push(v*c,-R,v*S),o.push(c,0,S),_.push(A,1-g)}}for(let a=0;a<y;a++)for(let g=0;g<p;g++){let R=g+(p+1)*a,v=g+(p+1)*(a+1),w=g+1+(p+1)*(a+1),A=g+1+(p+1)*a;n.push(R,v,A),n.push(v,w,A)}let f=t.length/3>65535,b=[];for(let a=0;a<n.length;a+=3){let g=n[a],R=n[a+1],v=n[a+2];b.push(g,R,R,v,v,g)}return{position:new Float32Array(t),normal:new Float32Array(o),uv:new Float32Array(_),index:f?new Uint32Array(n):new Uint16Array(n),wireframeIndex:f?new Uint32Array(b):new Uint16Array(b)}}function he(d,e,r,i,l,t){let o=d/2,_=e/2,n=Math.floor(r),p=Math.floor(i),y=n+1,h=p+1,f=d/n,b=e/p,a=[],g=[],R=[],v=[];for(let x=0;x<h;x++){let c=x*b-_;for(let S=0;S<y;S++){let u=S*f-o,T=u,M=c,P=0,F=0,U=0,C=1;if(Math.abs(l)>.001){let z=d/l,B=u/z;T=z*Math.sin(B),P=z*(1-Math.cos(B)),F=Math.sin(B),C=Math.cos(B)}if(Math.abs(t)>.001){let z=c/e*t,B=Math.cos(z),E=Math.sin(z),D=T*B-P*E,L=T*E+P*B;T=D,P=L;let N=F*B-C*E,K=F*E+C*B;F=N,C=K}a.push(T,-M,P),g.push(F,U,C),R.push(S/n),R.push(1-x/p)}}for(let x=0;x<p;x++)for(let c=0;c<n;c++){let S=c+y*x,u=c+y*(x+1),T=c+1+y*(x+1),M=c+1+y*x;v.push(S,u,M),v.push(u,T,M)}let w=a.length/3>65535,A=[];for(let x=0;x<v.length;x+=3){let c=v[x],S=v[x+1],u=v[x+2];A.push(c,S,S,u,u,c)}return{position:new Float32Array(a),normal:new Float32Array(g),uv:new Float32Array(R),index:w?new Uint32Array(v):new Uint16Array(v),wireframeIndex:w?new Uint32Array(A):new Uint16Array(A)}}var wt={kty:"EC",crv:"P-256",x:"n9A9jNvLNR6QJaPP4ZdpbXtPFz3ASUfeeQm11Jd53Rg",y:"EoG5ezJ3hr4c62JjpsyabotdFeU-A1LyH-qHyabnKc0",key_ops:["verify"],ext:!0};function de(d){let e=d.replace(/-/g,"+").replace(/_/g,"/");for(;e.length%4!==0;)e+="=";let r=atob(e),i=new Uint8Array(r.length);for(let l=0;l<r.length;l++)i[l]=r.charCodeAt(l);return i}function bt(d){if(typeof window>"u"||!window.location)return!0;let e=window.location.hostname.toLowerCase(),r=d.toLowerCase();return!!(e==="localhost"||e==="127.0.0.1"||e==="0.0.0.0"||e==="[::1]"||e.endsWith(".localhost")||e===r||e.endsWith("."+r))}async function Rt(d){try{if(typeof crypto>"u"||!crypto.subtle||typeof crypto.subtle.verify!="function")return{valid:!1,reason:"Web Crypto API not available (page must be served over HTTPS)"};let e=d.trim();if(!e.startsWith("NEAT-"))return{valid:!1,reason:'Key must start with "NEAT-" prefix'};let r=e.slice(5),i=r.indexOf(".");if(i===-1)return{valid:!1,reason:"Invalid key format: missing separator"};let l=r.slice(0,i),t=r.slice(i+1);if(!l||!t)return{valid:!1,reason:"Invalid key format: empty payload or signature"};let o=de(l).buffer.slice(0),_=new TextDecoder().decode(o),n=JSON.parse(_);if(!n.domain||typeof n.domain!="string")return{valid:!1,reason:"Invalid payload: missing domain"};if(!bt(n.domain)){let h=typeof window<"u"&&window.location?window.location.hostname:"unknown";return{valid:!1,reason:`Domain mismatch: key is for "${n.domain}" but current hostname is "${h}"`}}let p=de(t).buffer.slice(0),y=await crypto.subtle.importKey("jwk",wt,{name:"ECDSA",namedCurve:"P-256"},!1,["verify"]);return await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},y,p,o)?{valid:!0,payload:n}:{valid:!1,reason:"Signature verification failed"}}catch(e){return{valid:!1,reason:`Unexpected error: ${e instanceof Error?e.message:String(e)}`}}}var At="1.0.2";function me(){console.info(`%c\u{1F308} Neat Gradients v${At}%c

Licensed under MIT + The Commons Clause.
Free for personal and commercial use.
Selling this software or its derivatives is strictly prohibited.
Get a license key to remove the watermark and this message: https://neat.firecms.co`,"font-weight: bold; font-size: 14px; color: #FF5772;","color: inherit;")}var Y=50,V=80,j=6,Tt=[["speed","_speed",20,1/20,"u"],["horizontalPressure","_horizontalPressure",4,1/4,"u"],["verticalPressure","_verticalPressure",4,1/4,"u"],["waveFrequencyX","_waveFrequencyX",1/.04,.04,"u"],["waveFrequencyY","_waveFrequencyY",1/.04,.04,"u"],["waveAmplitude","_waveAmplitude",1/.75,.75,"u"],["highlights","_highlights",100,1/100,"u"],["shadows","_shadows",100,1/100,"u"],["colorSaturation","_saturation",10,1/10,"u"],["colorBlending","_colorBlending",10,1/10,"u"],["yOffsetWaveMultiplier","_yOffsetWaveMultiplier",1e3,1/1e3,"u"],["yOffsetColorMultiplier","_yOffsetColorMultiplier",1e3,1/1e3,"u"],["yOffsetFlowMultiplier","_yOffsetFlowMultiplier",1e3,1/1e3,"u"],["colorBrightness","_brightness",1,1,"u"],["grainIntensity","_grainIntensity",1,1,"u"],["grainSparsity","_grainSparsity",1,1,"u"],["grainSpeed","_grainSpeed",1,1,"u"],["wireframe","_wireframe",1,1,"u"],["backgroundAlpha","_backgroundAlpha",1,1,"u"],["flowDistortionA","_flowDistortionA",1,1,"u"],["flowDistortionB","_flowDistortionB",1,1,"u"],["flowScale","_flowScale",1,1,"u"],["flowEase","_flowEase",1,1,"u"],["flowEnabled","_flowEnabled",1,1,"u"],["textureEase","_textureEase",1,1,"u"],["silhouetteFade","_silhouetteFade",1,1,"u"],["cylinderFade","_cylinderFade",1,1,"u"],["ribbonFade","_ribbonFade",1,1,"u"],["flatShading","_flatShading",1,1,"u"],["domainWarpEnabled","_domainWarpEnabled",1,1,"u"],["domainWarpIntensity","_domainWarpIntensity",1,1,"u"],["domainWarpScale","_domainWarpScale",1,1,"u"],["vignetteIntensity","_vignetteIntensity",1,1,"u"],["vignetteRadius","_vignetteRadius",1,1,"u"],["fresnelEnabled","_fresnelEnabled",1,1,"u"],["fresnelPower","_fresnelPower",1,1,"u"],["fresnelIntensity","_fresnelIntensity",1,1,"u"],["iridescenceEnabled","_iridescenceEnabled",1,1,"u"],["iridescenceIntensity","_iridescenceIntensity",1,1,"u"],["iridescenceSpeed","_iridescenceSpeed",1,1,"u"],["bloomIntensity","_bloomIntensity",1,1,"u"],["bloomThreshold","_bloomThreshold",1,1,"u"],["chromaticAberration","_chromaticAberration",1,1,"u"],["shapeRotationX","_shapeRotationX",1,1,"u"],["shapeRotationY","_shapeRotationY",1,1,"u"],["shapeRotationZ","_shapeRotationZ",1,1,"u"],["shapeAutoRotateSpeedX","_shapeAutoRotateSpeedX",1,1,"u"],["shapeAutoRotateSpeedY","_shapeAutoRotateSpeedY",1,1,"u"],["cameraX","_cameraX",1,1,"u"],["cameraY","_cameraY",1,1,"u"],["cameraZ","_cameraZ",1,1,"u"],["cameraRotationX","_cameraRotationX",1,1,"u"],["cameraRotationY","_cameraRotationY",1,1,"u"],["cameraRotationZ","_cameraRotationZ",1,1,"u"],["textureVoidLikelihood","_textureVoidLikelihood",1,1,"t"],["textureVoidWidthMin","_textureVoidWidthMin",1,1,"t"],["textureVoidWidthMax","_textureVoidWidthMax",1,1,"t"],["textureBandDensity","_textureBandDensity",1,1,"t"],["textureColorBlending","_textureColorBlending",1,1,"t"],["textureSeed","_textureSeed",1,1,"t"],["transparentTextureVoid","_transparentTextureVoid",1,1,"t"],["proceduralBackgroundColor","_proceduralBackgroundColor",1,1,"t"],["textureShapeTriangles","_textureShapeTriangles",1,1,"t"],["textureShapeCircles","_textureShapeCircles",1,1,"t"],["textureShapeBars","_textureShapeBars",1,1,"t"],["textureShapeSquiggles","_textureShapeSquiggles",1,1,"t"],["sphereRadius","_sphereRadius",1,1,"g"],["torusRadius","_torusRadius",1,1,"g"],["torusTube","_torusTube",1,1,"g"],["cylinderRadius","_cylinderRadius",1,1,"g"],["cylinderHeight","_cylinderHeight",1,1,"g"],["planeBend","_planeBend",1,1,"g"],["planeTwist","_planeTwist",1,1,"g"]],te=class{_ref;_licensed=!1;_antialias=!1;_speed=-1;_horizontalPressure=-1;_verticalPressure=-1;_waveFrequencyX=-1;_waveFrequencyY=-1;_waveAmplitude=-1;_shadows=-1;_highlights=-1;_saturation=-1;_brightness=-1;_grainScale=-1;_grainIntensity=-1;_grainSparsity=-1;_grainSpeed=-1;_colorBlending=-1;_resolution=1;_colors=[];_wireframe=!1;_backgroundColor="#FFFFFF";_backgroundColorRgb=[1,1,1];_backgroundAlpha=1;_flowDistortionA=0;_flowDistortionB=0;_flowScale=1;_flowEase=0;_flowEnabled=!0;glState;_enableProceduralTexture=!1;_textureVoidLikelihood=.45;_textureVoidWidthMin=200;_textureVoidWidthMax=486;_textureBandDensity=2.15;_textureColorBlending=.01;_textureSeed=333;_textureEase=.5;_transparentTextureVoid=!1;_domainWarpEnabled=!1;_domainWarpIntensity=.5;_domainWarpScale=1;_vignetteIntensity=.5;_vignetteRadius=.8;_fresnelEnabled=!1;_fresnelPower=2;_fresnelIntensity=.5;_fresnelColor="#FFFFFF";_fresnelColorRgb=[1,1,1];_iridescenceEnabled=!1;_iridescenceIntensity=.5;_iridescenceSpeed=1;_bloomIntensity=0;_bloomThreshold=.7;_chromaticAberration=0;_silhouetteFade=.25;_cylinderFade=.08;_ribbonFade=.05;_flatShading=!0;_shapeType="plane";_shapeRotationX=0;_shapeRotationY=0;_shapeRotationZ=0;_shapeAutoRotateSpeedX=0;_shapeAutoRotateSpeedY=0;_sphereRadius=15;_torusRadius=15;_torusTube=5;_cylinderRadius=10;_cylinderHeight=40;_planeBend=0;_planeTwist=0;_cameraLock=!1;_cameraX=0;_cameraY=0;_cameraZ=0;_cameraRotationX=0;_cameraRotationY=0;_cameraRotationZ=0;_cameraZoom=1;_proceduralTexture=null;_proceduralBackgroundColor="#000000";_textureShapeTriangles=20;_textureShapeCircles=15;_textureShapeBars=15;_textureShapeSquiggles=10;requestRef=-1;sizeObserver;_currentCursor="";_initialized=!1;_cachedColorRgb=[];_yOffset=0;_yOffsetWaveMultiplier=.004;_yOffsetColorMultiplier=.004;_yOffsetFlowMultiplier=.004;_sourceCanvas=null;_sourceCtx=null;_maskedCanvas=null;_maskedCtx=null;_resizeTimeoutId=null;_textureNeedsUpdate=!1;_colorsChanged=!0;_uniformsDirty=!0;_textureDirty=!0;_yOffsetDirty=!1;_modelViewMatrix=new $;_isVisible=!0;_visibilityObserver=null;_visibilityHandler=null;_watermarkProgram=null;_watermarkTexture=null;_watermarkBuffer=null;_watermarkTexCoordBuffer=null;_watermarkWidth=0;_watermarkHeight=0;_watermarkMargin=4;_wmLocPos=-1;_wmLocTc=-1;_wmLocTex=null;_wmPosData=new Float32Array(8);_wmClickHandler=null;_wmMoveHandler=null;_wmMoveRafPending=!1;_wmCachedRect=null;_wmRectCacheTime=0;_gradientVAO=null;_watermarkVAO=null;constructor(e){let{ref:r,speed:i=4,horizontalPressure:l=3,verticalPressure:t=3,waveFrequencyX:o=5,waveFrequencyY:_=5,waveAmplitude:n=3,colors:p,highlights:y=4,shadows:h=4,colorSaturation:f=0,colorBrightness:b=1,colorBlending:a=5,grainScale:g=2,grainIntensity:R=.55,grainSparsity:v=0,grainSpeed:w=.1,wireframe:A=!1,backgroundColor:x="#FFFFFF",backgroundAlpha:c=1,resolution:S=1,seed:u,yOffset:T=0,yOffsetWaveMultiplier:M=4,yOffsetColorMultiplier:P=4,yOffsetFlowMultiplier:F=4,flowDistortionA:U=0,flowDistortionB:C=0,flowScale:z=1,flowEase:B=0,flowEnabled:E=!0,enableProceduralTexture:D=!1,textureVoidLikelihood:L=.45,textureVoidWidthMin:N=200,textureVoidWidthMax:K=486,textureBandDensity:pe=2.15,textureColorBlending:ge=.01,textureSeed:ve=333,textureEase:ye=.5,proceduralBackgroundColor:xe="#000000",transparentTextureVoid:we=!1,textureShapeTriangles:be=20,textureShapeCircles:Re=15,textureShapeBars:Ae=15,textureShapeSquiggles:Te=10,domainWarpEnabled:Ee=!1,domainWarpIntensity:Se=.5,domainWarpScale:Fe=1,vignetteIntensity:Pe=0,vignetteRadius:Me=.8,fresnelEnabled:Ce=!1,fresnelPower:Ue=2,fresnelIntensity:Be=.5,fresnelColor:ze="#FFFFFF",iridescenceEnabled:De=!1,iridescenceIntensity:Ie=.5,iridescenceSpeed:Le=1,bloomIntensity:ke=0,bloomThreshold:Oe=.7,chromaticAberration:Ye=0,silhouetteFade:Ve=.25,cylinderFade:Ne=.08,ribbonFade:We=.05,flatShading:Xe=!0,cameraLock:He=!1,cameraX:qe=0,cameraY:Ge=0,cameraZ:Ze=0,cameraRotationX:je=0,cameraRotationY:$e=0,cameraRotationZ:Ke=0,cameraZoom:Je=1,shapeType:Qe="plane",shapeRotationX:et=0,shapeRotationY:tt=0,shapeRotationZ:it=0,shapeAutoRotateSpeedX:rt=0,shapeAutoRotateSpeedY:ot=0,sphereRadius:st=15,torusRadius:nt=15,torusTube:at=5,cylinderRadius:lt=10,cylinderHeight:_t=40,planeBend:ut=0,planeTwist:ft=0,licenseKey:ie,preserveDrawingBuffer:ct=!1,antialias:ht=!1}=e;this._ref=r,this._antialias=ht,this.destroy=this.destroy.bind(this),this._initScene=this._initScene.bind(this),this.speed=i,this.horizontalPressure=l,this.verticalPressure=t,this.waveFrequencyX=o,this.waveFrequencyY=_,this.waveAmplitude=n,this.colorBlending=a,this._resolution=S,this.grainScale=g,this.grainIntensity=R,this.grainSparsity=v,this.grainSpeed=w,this.colors=p,this.shadows=h,this.highlights=y,this.colorSaturation=f,this.colorBrightness=b,this.wireframe=A,this.backgroundColor=x,this.backgroundAlpha=c,this.yOffset=T,this.yOffsetWaveMultiplier=M,this.yOffsetColorMultiplier=P,this.yOffsetFlowMultiplier=F,this.flowDistortionA=U,this.flowDistortionB=C,this.flowScale=z,this.flowEase=B,this.flowEnabled=E,this.enableProceduralTexture=D,this.textureVoidLikelihood=L,this.textureVoidWidthMin=N,this.textureVoidWidthMax=K,this.textureBandDensity=pe,this.textureColorBlending=ge,this.textureSeed=ve,this.textureEase=ye,this._proceduralBackgroundColor=xe,this.transparentTextureVoid=we,this._textureShapeTriangles=be,this._textureShapeCircles=Re,this._textureShapeBars=Ae,this._textureShapeSquiggles=Te,this.domainWarpEnabled=Ee,this.domainWarpIntensity=Se,this.domainWarpScale=Fe,this.vignetteIntensity=Pe,this.vignetteRadius=Me,this.fresnelEnabled=Ce,this.fresnelPower=Ue,this.fresnelIntensity=Be,this.fresnelColor=ze,this.iridescenceEnabled=De,this.iridescenceIntensity=Ie,this.iridescenceSpeed=Le,this.bloomIntensity=ke,this.bloomThreshold=Oe,this.chromaticAberration=Ye,this.silhouetteFade=Ve,this.cylinderFade=Ne,this.ribbonFade=We,this._flatShading=Xe,this._cameraLock=He,this._cameraX=qe,this._cameraY=Ge,this._cameraZ=Ze,this._cameraRotationX=je,this._cameraRotationY=$e,this._cameraRotationZ=Ke,this._cameraZoom=Je,this._shapeType=Qe,this._shapeRotationX=et,this._shapeRotationY=tt,this._shapeRotationZ=it,this._shapeAutoRotateSpeedX=rt,this._shapeAutoRotateSpeedY=ot,this._sphereRadius=st,this._torusRadius=nt,this._torusTube=at,this._cylinderRadius=lt,this._cylinderHeight=_t,this._planeBend=ut,this._planeTwist=ft,this.glState=this._initScene(S,ct),this._initWatermark(),St(),ie?Rt(ie).then(s=>{this._licensed=s.valid,s.valid||(console.warn(`NEAT license key error: ${s.reason}`),me())}):me();let q=u!==void 0?u:Et(),G=performance.now(),X=()=>{let{gl:s,program:k,locations:m,indexCount:W,indexType:H}=this.glState;if(this._initialized){let re=performance.now();q+=(re-G)/1e3*this._speed,G=re,s.useProgram(k),s.uniform1f(m.uniforms.u_time,q);let J=this.glState.camera,O=this._modelViewMatrix;O.identity(),O.translate(-J.position[0]-this._cameraX,-J.position[1]-this._cameraY,-J.position[2]-this._cameraZ),O.translate(0,0,-1),O.rotateX(-this._cameraRotationX),O.rotateY(-this._cameraRotationY),O.rotateZ(-this._cameraRotationZ);let Q=this._shapeRotationX,oe=this._shapeRotationY,mt=this._shapeRotationZ;this._shapeAutoRotateSpeedX!==0&&(Q+=q*this._shapeAutoRotateSpeedX*.1),this._shapeAutoRotateSpeedY!==0&&(oe+=q*this._shapeAutoRotateSpeedY*.1),this._shapeType==="plane"||this._shapeType==="ribbon"?O.rotateX(Q-Math.PI/3.5):O.rotateX(Q),O.rotateY(oe),O.rotateZ(mt);let se=m.uniforms.modelViewMatrix;if(se&&s.uniformMatrix4fv(se,!1,O.elements),this._yOffsetDirty&&!this._uniformsDirty&&(s.uniform1f(m.uniforms.u_y_offset,this._yOffset),this._yOffsetDirty=!1),this._uniformsDirty){s.uniform2f(m.uniforms.u_resolution,this._ref.width,this._ref.height),s.uniform2f(m.uniforms.u_color_pressure,this._horizontalPressure,this._verticalPressure),s.uniform1f(m.uniforms.u_wave_frequency_x,this._waveFrequencyX),s.uniform1f(m.uniforms.u_wave_frequency_y,this._waveFrequencyY),s.uniform1f(m.uniforms.u_wave_amplitude,this._waveAmplitude),s.uniform1f(m.uniforms.u_color_blending,this._colorBlending),s.uniform1f(m.uniforms.u_shadows,this._shadows),s.uniform1f(m.uniforms.u_highlights,this._highlights),s.uniform1f(m.uniforms.u_saturation,this._saturation),s.uniform1f(m.uniforms.u_brightness,this._brightness),s.uniform1f(m.uniforms.u_grain_intensity,this._grainIntensity),s.uniform1f(m.uniforms.u_grain_sparsity,this._grainSparsity),s.uniform1f(m.uniforms.u_grain_speed,this._grainSpeed),s.uniform1f(m.uniforms.u_grain_scale,this._grainScale),s.uniform1f(m.uniforms.u_y_offset,this._yOffset),s.uniform1f(m.uniforms.u_y_offset_wave_multiplier,this._yOffsetWaveMultiplier),s.uniform1f(m.uniforms.u_y_offset_color_multiplier,this._yOffsetColorMultiplier),s.uniform1f(m.uniforms.u_y_offset_flow_multiplier,this._yOffsetFlowMultiplier),s.uniform1f(m.uniforms.u_flow_distortion_a,this._flowDistortionA),s.uniform1f(m.uniforms.u_flow_distortion_b,this._flowDistortionB),s.uniform1f(m.uniforms.u_flow_scale,this._flowScale),s.uniform1f(m.uniforms.u_flow_ease,this._flowEase),s.uniform1f(m.uniforms.u_flow_enabled,this._flowEnabled?1:0);let I=0;this._shapeType==="sphere"?I=1:this._shapeType==="torus"?I=2:this._shapeType==="cylinder"?I=3:this._shapeType==="ribbon"&&(I=4),s.uniform1f(m.uniforms.u_shape_type,I),s.uniform1f(m.uniforms.u_enable_procedural_texture,this._enableProceduralTexture?1:0),s.uniform1f(m.uniforms.u_texture_ease,this._textureEase),s.uniform1f(m.uniforms.u_transparent_texture_void,this._transparentTextureVoid?1:0),s.uniform1f(m.uniforms.u_domain_warp_enabled,this._domainWarpEnabled?1:0),s.uniform1f(m.uniforms.u_domain_warp_intensity,this._domainWarpIntensity),s.uniform1f(m.uniforms.u_domain_warp_scale,this._domainWarpScale),s.uniform1f(m.uniforms.u_vignette_intensity,this._vignetteIntensity),s.uniform1f(m.uniforms.u_vignette_radius,this._vignetteRadius),s.uniform1f(m.uniforms.u_fresnel_enabled,this._fresnelEnabled?1:0),s.uniform1f(m.uniforms.u_fresnel_power,this._fresnelPower),s.uniform1f(m.uniforms.u_fresnel_intensity,this._fresnelIntensity),s.uniform3fv(m.uniforms.u_fresnel_color,this._fresnelColorRgb),s.uniform1f(m.uniforms.u_iridescence_enabled,this._iridescenceEnabled?1:0),s.uniform1f(m.uniforms.u_iridescence_intensity,this._iridescenceIntensity),s.uniform1f(m.uniforms.u_iridescence_speed,this._iridescenceSpeed),s.uniform1f(m.uniforms.u_bloom_intensity,this._bloomIntensity),s.uniform1f(m.uniforms.u_bloom_threshold,this._bloomThreshold),s.uniform1f(m.uniforms.u_chromatic_aberration,this._chromaticAberration),s.uniform1f(m.uniforms.u_silhouette_fade,this._silhouetteFade),s.uniform1f(m.uniforms.u_cylinder_fade,this._cylinderFade),s.uniform1f(m.uniforms.u_ribbon_fade,this._ribbonFade),s.uniform1f(m.uniforms.u_flat_shading,this._flatShading?1:0),this._uniformsDirty=!1,this._yOffsetDirty=!1}if(this._textureNeedsUpdate&&this._enableProceduralTexture&&(this._proceduralTexture&&s.deleteTexture(this._proceduralTexture),this._proceduralTexture=this._createProceduralTexture(s),this._textureNeedsUpdate=!1,this._textureDirty=!0),this._textureDirty&&this._proceduralTexture&&(s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,this._proceduralTexture),s.uniform1i(m.uniforms.u_procedural_texture,1),this._textureDirty=!1),this._colorsChanged){this._colorsChanged=!1;for(let I=0;I<j;I++)if(I<this._colors.length){let ne=this._colors[I],pt=this._cachedColorRgb[I]||[0,0,0];s.uniform1f(m.uniforms[`u_colors[${I}].is_active`],ne.enabled?1:0),s.uniform3fv(m.uniforms[`u_colors[${I}].color`],pt),s.uniform1f(m.uniforms[`u_colors[${I}].influence`],ne.influence||0)}else s.uniform1f(m.uniforms[`u_colors[${I}].is_active`],0);s.uniform1i(m.uniforms.u_colors_count,j)}}s.clearColor(this._backgroundColorRgb[0],this._backgroundColorRgb[1],this._backgroundColorRgb[2],this._backgroundAlpha),s.clear(s.COLOR_BUFFER_BIT|s.DEPTH_BUFFER_BIT),this._wireframe?(s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,this.glState.buffers.wireframeIndex),s.drawElements(s.LINES,this.glState.wireframeIndexCount,H,0),s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,this.glState.buffers.index)):s.drawElements(s.TRIANGLES,W,H,0),this._licensed||this._renderWatermark(s),this._isVisible&&(this.requestRef=requestAnimationFrame(X))};this._visibilityObserver=new IntersectionObserver(s=>{let k=this._isVisible;this._isVisible=s[0].isIntersecting&&document.visibilityState!=="hidden",this._isVisible&&!k&&(G=performance.now(),this.requestRef=requestAnimationFrame(X))},{threshold:0}),this._visibilityObserver.observe(r),this._visibilityHandler=()=>{let s=this._isVisible;document.visibilityState==="hidden"?this._isVisible=!1:(this._isVisible=!0,s||(G=performance.now(),this.requestRef=requestAnimationFrame(X)))},document.addEventListener("visibilitychange",this._visibilityHandler);let dt=(s,k)=>{if(this._ref.width===s&&this._ref.height===k)return;let{gl:m,camera:W}=this.glState;this._ref.width=s,this._ref.height=k,m.viewport(0,0,s,k),Z(W,s,k,Y,V,this._shapeType,this._cameraZoom);let H=this.glState.locations.uniforms.projectionMatrix;m.useProgram(this.glState.program),H&&m.uniformMatrix4fv(H,!1,W.projectionMatrix.elements),this._uniformsDirty=!0,X()};this.sizeObserver=new ResizeObserver(s=>{let k=s[s.length-1],m=Math.round(k.contentRect.width),W=Math.round(k.contentRect.height);this._resizeTimeoutId!==null&&clearTimeout(this._resizeTimeoutId),this._resizeTimeoutId=window.setTimeout(()=>{dt(m,W),this._resizeTimeoutId=null,this._wmCachedRect=null},100)}),this.sizeObserver.observe(r),X()}destroy(){if(cancelAnimationFrame(this.requestRef),this.sizeObserver.disconnect(),this._visibilityObserver&&(this._visibilityObserver.disconnect(),this._visibilityObserver=null),this._visibilityHandler&&(document.removeEventListener("visibilitychange",this._visibilityHandler),this._visibilityHandler=null),this._resizeTimeoutId!==null&&(clearTimeout(this._resizeTimeoutId),this._resizeTimeoutId=null),this._wmClickHandler&&(document.removeEventListener("click",this._wmClickHandler,!0),this._wmClickHandler=null),this._wmMoveHandler&&(document.removeEventListener("mousemove",this._wmMoveHandler),this._wmMoveHandler=null),this.glState){let e=this.glState.gl;e.deleteProgram(this.glState.program),e.deleteBuffer(this.glState.buffers.position),e.deleteBuffer(this.glState.buffers.normal),e.deleteBuffer(this.glState.buffers.uv),e.deleteBuffer(this.glState.buffers.index),e.deleteBuffer(this.glState.buffers.wireframeIndex),this._watermarkProgram&&e.deleteProgram(this._watermarkProgram),this._watermarkTexture&&e.deleteTexture(this._watermarkTexture),this._watermarkBuffer&&e.deleteBuffer(this._watermarkBuffer),this._watermarkTexCoordBuffer&&e.deleteBuffer(this._watermarkTexCoordBuffer);let r=e;r.deleteVertexArray&&(this._gradientVAO&&r.deleteVertexArray(this._gradientVAO),this._watermarkVAO&&r.deleteVertexArray(this._watermarkVAO))}this._proceduralTexture&&this.glState&&this.glState.gl.deleteTexture(this._proceduralTexture)}get colors(){return this._colors}set colors(e){this._uniformsDirty=!0,this._colors=e,this._cachedColorRgb=e.map(r=>this._hexToRgb(r.color)),this._colorsChanged=!0}get grainScale(){return this._grainScale}set grainScale(e){this._uniformsDirty=!0,this._grainScale=e==0?1:e}get resolution(){return this._resolution}set resolution(e){this._resolution!==e&&(this._resolution=e,this._updateGeometry())}get antialias(){return this._antialias}set antialias(e){this._antialias!==e&&(this._antialias=e,console.warn("NeatGradient: Changing 'antialias' at runtime is not supported because the WebGL context is already created. Recreate the NeatGradient instance to apply this change."))}get backgroundColor(){return this._backgroundColor}set backgroundColor(e){this._uniformsDirty=!0,this._backgroundColor=e,this._backgroundColorRgb=this._hexToRgb(e)}get yOffset(){return this._yOffset}set yOffset(e){this._yOffset!==e&&(this._yOffsetDirty=!0,this._yOffset=e)}get enableProceduralTexture(){return this._enableProceduralTexture}set enableProceduralTexture(e){this._uniformsDirty=!0,this._enableProceduralTexture=e,e&&!this._proceduralTexture&&(this._textureNeedsUpdate=!0)}_updateGeometry(){if(!this.glState)return;let e=this.glState.gl,r=this._resolution||1,i;this._shapeType==="sphere"?i=ue(this._sphereRadius,120*r,120*r):this._shapeType==="torus"?i=fe(this._torusRadius,this._torusTube,120*r,120*r):this._shapeType==="cylinder"?i=ce(this._cylinderRadius,this._cylinderRadius,this._cylinderHeight,120*r,120*r):this._shapeType==="ribbon"?i=he(Y,V,240*r,240*r,this._planeBend,this._planeTwist):i=_e(Y,V,240*r,240*r);let{position:l,normal:t,uv:o,index:_,wireframeIndex:n}=i;e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.position),e.bufferData(e.ARRAY_BUFFER,l,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.normal),e.bufferData(e.ARRAY_BUFFER,t,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.uv),e.bufferData(e.ARRAY_BUFFER,o,e.STATIC_DRAW),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,this.glState.buffers.index),e.bufferData(e.ELEMENT_ARRAY_BUFFER,_,e.STATIC_DRAW),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,this.glState.buffers.wireframeIndex),e.bufferData(e.ELEMENT_ARRAY_BUFFER,n,e.STATIC_DRAW),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,this.glState.buffers.index),this.glState.indexCount=_.length,this.glState.wireframeIndexCount=n.length,this.glState.indexType=_ instanceof Uint32Array?e.UNSIGNED_INT:e.UNSIGNED_SHORT;let p=this._ref.width,y=this._ref.height;Z(this.glState.camera,p,y,Y,V,this._shapeType,this._cameraZoom);let h=this.glState.locations.uniforms.projectionMatrix;e.useProgram(this.glState.program),h&&e.uniformMatrix4fv(h,!1,this.glState.camera.projectionMatrix.elements),this._uniformsDirty=!0}_hexToRgb(e){let r=parseInt(e.replace("#",""),16);return[(r>>16&255)/255,(r>>8&255)/255,(r&255)/255]}_initScene(e,r=!1){let i=this._ref.width,l=this._ref.height;(i===0||l===0||i===300&&l===150)&&(i=this._ref.clientWidth||300,l=this._ref.clientHeight||150,this._ref.width=i,this._ref.height=l);let t=this._ref.getContext("webgl2",{alpha:!0,preserveDrawingBuffer:r,antialias:this._antialias})||this._ref.getContext("webgl",{alpha:!0,preserveDrawingBuffer:r,antialias:this._antialias});if(!t)throw new Error("WebGL not supported");t.getExtension("OES_standard_derivatives"),t.getExtension("OES_element_index_uint"),t.viewport(0,0,i,l);let o;this._shapeType==="sphere"?o=ue(this._sphereRadius,120*e,120*e):this._shapeType==="torus"?o=fe(this._torusRadius,this._torusTube,120*e,120*e):this._shapeType==="cylinder"?o=ce(this._cylinderRadius,this._cylinderRadius,this._cylinderHeight,120*e,120*e):this._shapeType==="ribbon"?o=he(Y,V,240*e,240*e,this._planeBend,this._planeTwist):o=_e(Y,V,240*e,240*e);let{position:_,normal:n,uv:p,index:y,wireframeIndex:h}=o,f=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,f),t.bufferData(t.ARRAY_BUFFER,_,t.STATIC_DRAW);let b=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,b),t.bufferData(t.ARRAY_BUFFER,n,t.STATIC_DRAW);let a=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,p,t.STATIC_DRAW);let g=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,g),t.bufferData(t.ELEMENT_ARRAY_BUFFER,y,t.STATIC_DRAW);let R=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,R),t.bufferData(t.ELEMENT_ARRAY_BUFFER,h,t.STATIC_DRAW),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,g);let v=yt()+`
`+ae()+`
`+le()+`
`+gt,w=t.createShader(t.VERTEX_SHADER);t.shaderSource(w,v),t.compileShader(w),t.getShaderParameter(w,t.COMPILE_STATUS)||(console.log("VERTEX_SHADER_ERROR_START"),console.log("Vertex shader error: ",t.getShaderInfoLog(w)),console.log("GL Error Code:",t.getError()),console.log("Vertex Shader Source Dump:"),console.log(v.split(`
`).map((E,D)=>`${D+1}: ${E}`).join(`
`)),console.log("VERTEX_SHADER_ERROR_END"));let A=xt()+`
`+le()+`
`+ae()+`
`+vt,x=t.createShader(t.FRAGMENT_SHADER);t.shaderSource(x,A),t.compileShader(x),t.getShaderParameter(x,t.COMPILE_STATUS)||(console.log("FRAGMENT_SHADER_ERROR_START"),console.log("Fragment shader error: ",t.getShaderInfoLog(x)),console.log("GL Error Code:",t.getError()),console.log("Fragment Shader Source Dump:"),console.log(A.split(`
`).map((E,D)=>`${D+1}: ${E}`).join(`
`)),console.log("FRAGMENT_SHADER_ERROR_END"));let c=t.createProgram();t.attachShader(c,w),t.attachShader(c,x),t.linkProgram(c),t.getProgramParameter(c,t.LINK_STATUS)||(console.log("PROGRAM_LINK_ERROR_START"),console.log("Program linking error: ",t.getProgramInfoLog(c)),console.log("GL Error Code:",t.getError()),console.log("PROGRAM_LINK_ERROR_END")),t.useProgram(c);let S=new ee(0,0,0,0,0,1e3);S.position=[0,0,5],Z(S,i,l,Y,V,this._shapeType,this._cameraZoom);let u=t.getAttribLocation(c,"position"),T=t.getAttribLocation(c,"normal"),M=t.getAttribLocation(c,"uv");t.enableVertexAttribArray(u),t.bindBuffer(t.ARRAY_BUFFER,f),t.vertexAttribPointer(u,3,t.FLOAT,!1,0,0),t.enableVertexAttribArray(T),t.bindBuffer(t.ARRAY_BUFFER,b),t.vertexAttribPointer(T,3,t.FLOAT,!1,0,0),t.enableVertexAttribArray(M),t.bindBuffer(t.ARRAY_BUFFER,a),t.vertexAttribPointer(M,2,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,g);let P=t.getUniformLocation(c,"projectionMatrix");t.uniformMatrix4fv(P,!1,S.projectionMatrix.elements);let F=t.getUniformLocation(c,"u_plane_width");t.uniform1f(F,Y);let U=t.getUniformLocation(c,"u_plane_height");t.uniform1f(U,V);let C=t.getUniformLocation(c,"u_colors_count");t.uniform1i(C,j);let z=["projectionMatrix","modelViewMatrix","u_time","u_resolution","u_color_pressure","u_wave_frequency_x","u_wave_frequency_y","u_wave_amplitude","u_colors_count","u_plane_width","u_plane_height","u_shadows","u_highlights","u_grain_intensity","u_grain_sparsity","u_grain_scale","u_grain_speed","u_flow_distortion_a","u_flow_distortion_b","u_flow_scale","u_flow_ease","u_flow_enabled","u_y_offset","u_y_offset_wave_multiplier","u_y_offset_color_multiplier","u_y_offset_flow_multiplier","u_procedural_texture","u_enable_procedural_texture","u_texture_ease","u_transparent_texture_void","u_saturation","u_brightness","u_color_blending","u_domain_warp_enabled","u_domain_warp_intensity","u_domain_warp_scale","u_vignette_intensity","u_vignette_radius","u_fresnel_enabled","u_fresnel_power","u_fresnel_intensity","u_fresnel_color","u_iridescence_enabled","u_iridescence_intensity","u_iridescence_speed","u_bloom_intensity","u_bloom_threshold","u_chromatic_aberration","u_shape_type","u_silhouette_fade","u_cylinder_fade","u_ribbon_fade","u_flat_shading"],B={attributes:{position:u,normal:T,uv:M},uniforms:{}};z.forEach(E=>{B.uniforms[E]=t.getUniformLocation(c,E)});for(let E=0;E<j;E++)B.uniforms[`u_colors[${E}].is_active`]=t.getUniformLocation(c,`u_colors[${E}].is_active`),B.uniforms[`u_colors[${E}].color`]=t.getUniformLocation(c,`u_colors[${E}].color`),B.uniforms[`u_colors[${E}].influence`]=t.getUniformLocation(c,`u_colors[${E}].influence`);return this._initialized=!0,this._uniformsDirty=!0,this._colorsChanged=!0,this._textureDirty=!0,t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE_MINUS_SRC_ALPHA),t.enable(t.DEPTH_TEST),{gl:t,program:c,buffers:{position:f,normal:b,uv:a,index:g,wireframeIndex:R},locations:B,camera:S,indexCount:y.length,wireframeIndexCount:h.length,indexType:y instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT}}_createProceduralTexture(e){this._sourceCanvas||(this._sourceCanvas=document.createElement("canvas"),this._sourceCanvas.width=1024,this._sourceCanvas.height=1024,this._sourceCtx=this._sourceCanvas.getContext("2d"));let r=this._sourceCanvas,i=this._sourceCtx;if(!i)return null;let l=this._textureSeed,t=this._textureSeed;function o(){let u=Math.sin(l++)*1e4;return u-Math.floor(u)}let _=u=>{l=t+u},n=this._colors.filter(u=>u.enabled).map(u=>u.color);if(n.length===0)return null;let p=this._shapeType!=="plane",y=p?[-1,0,1]:[0],h=p?[-1,0,1]:[0];function f(u){let T=parseInt(u.replace("#",""),16);return{r:T>>16&255,g:T>>8&255,b:T&255}}function b(u,T,M){return"#"+((1<<24)+(Math.round(u)<<16)+(Math.round(T)<<8)+Math.round(M)).toString(16).slice(1).padStart(6,"0")}let a=()=>{let u=n[Math.floor(o()*n.length)],T=n[Math.floor(o()*n.length)],M=o()*this._textureColorBlending,P=f(u),F=f(T),U=P.r+(F.r-P.r)*M,C=P.g+(F.g-P.g)*M,z=P.b+(F.b-P.b)*M;return b(U,C,z)},g=this._proceduralBackgroundColor||"#000000";i.fillStyle=g,i.fillRect(0,0,1024,1024);let R=i.createLinearGradient(0,0,0,1024);R.addColorStop(0,a()),R.addColorStop(1,a()),i.fillStyle=R,i.fillRect(0,0,1024,1024);for(let u=0;u<this._textureShapeTriangles;u++){let T=a(),M=o()*1024,P=o()*1024,F=100+o()*300,U=(o()-.5)*F,C=(o()-.5)*F,z=(o()-.5)*F,B=(o()-.5)*F;for(let E of y)for(let D of h){i.fillStyle=T,i.beginPath();let L=M+E*1024,N=P+D*1024;i.moveTo(L,N),i.lineTo(L+U,N+C),i.lineTo(L+z,N+B),i.fill()}}for(let u=0;u<this._textureShapeCircles;u++){let T=a(),M=10+o()*50,P=o()*1024,F=o()*1024,U=50+o()*150;for(let C of y)for(let z of h)i.strokeStyle=T,i.lineWidth=M,i.beginPath(),i.arc(P+C*1024,F+z*1024,U,0,Math.PI*2),i.stroke()}for(let u=0;u<this._textureShapeBars;u++){let T=a(),M=o()*1024,P=o()*1024,F=o()*Math.PI;for(let U of y)for(let C of h)i.fillStyle=T,i.save(),i.translate(M+U*1024,P+C*1024),i.rotate(F),i.fillRect(-150,-25,300,50),i.restore()}i.lineWidth=15,i.lineCap="round";for(let u=0;u<this._textureShapeSquiggles;u++){let T=a(),M=o()*1024,P=o()*1024,F=[],U=0,C=0;for(let z=0;z<4;z++){let B=U+(o()-.5)*300,E=C+(o()-.5)*300;F.push({cx1:U+(o()-.5)*300,cy1:C+(o()-.5)*300,cx2:U+(o()-.5)*300,cy2:C+(o()-.5)*300,ex:B,ey:E}),U=B,C=E}for(let z of y)for(let B of h){i.strokeStyle=T,i.beginPath();let E=M+z*1024,D=P+B*1024;i.moveTo(E,D);for(let L of F)i.bezierCurveTo(E+L.cx1,D+L.cy1,E+L.cx2,D+L.cy2,E+L.ex,D+L.ey);i.stroke()}}_(5e4),this._maskedCanvas||(this._maskedCanvas=document.createElement("canvas"),this._maskedCanvas.width=1024,this._maskedCanvas.height=1024,this._maskedCtx=this._maskedCanvas.getContext("2d"));let v=this._maskedCanvas,w=this._maskedCtx;if(!w)return null;this._transparentTextureVoid?w.clearRect(0,0,1024,1024):(w.fillStyle=g,w.fillRect(0,0,1024,1024));let A=0,x=[];for(;A<1024;)if(o()<this._textureVoidLikelihood){let u=this._textureVoidWidthMin+o()*(this._textureVoidWidthMax-this._textureVoidWidthMin);x.push({type:"void",x:A,width:u}),A+=u}else{let u=50+o()*200;x.push({type:"matter",x:A,width:u}),A+=u}for(let u of x)if(u.type==="matter"){let T=u.x,M=Math.min(u.x+u.width,1024),P=T;for(;P<M;){let F=(2+o()*20)/this._textureBandDensity,U=Math.floor(o()*1024);w.drawImage(r,U,0,F,1024,P,0,F,1024),P+=F}}let c=e.createTexture();e.bindTexture(e.TEXTURE_2D,c),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,v),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.generateMipmap(e.TEXTURE_2D);let S=e.getExtension("EXT_texture_filter_anisotropic")||e.getExtension("MOZ_EXT_texture_filter_anisotropic")||e.getExtension("WEBKIT_EXT_texture_filter_anisotropic");if(S){let u=e.getParameter(S.MAX_TEXTURE_MAX_ANISOTROPY_EXT);e.texParameterf(e.TEXTURE_2D,S.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(16,u))}return c}get fresnelColor(){return this._fresnelColor}set fresnelColor(e){this._fresnelColor!==e&&(this._fresnelColor=e,this._fresnelColorRgb=this._hexToRgb(e),this._uniformsDirty=!0)}get shapeType(){return this._shapeType}set shapeType(e){this._shapeType!==e&&(this._shapeType=e,this._updateGeometry())}get cameraLock(){return this._cameraLock}set cameraLock(e){this._cameraLock=e}get cameraZoom(){return this._cameraZoom}set cameraZoom(e){this._cameraZoom!==e&&(this._cameraZoom=e,this._updateCameraFrustum())}_updateCameraFrustum(){if(!this.glState)return;let e=this.glState.gl,r=this._ref.width,i=this._ref.height;Z(this.glState.camera,r,i,Y,V,this._shapeType,this._cameraZoom);let l=this.glState.locations.uniforms.projectionMatrix;e.useProgram(this.glState.program),l&&e.uniformMatrix4fv(l,!1,this.glState.camera.projectionMatrix.elements),this._uniformsDirty=!0}_initWatermark(){let e=this.glState.gl,r=e,i=typeof r.createVertexArray=="function",l=e.createShader(e.VERTEX_SHADER);e.shaderSource(l,Ft),e.compileShader(l);let t=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(t,Pt),e.compileShader(t);let o=e.createProgram();e.attachShader(o,l),e.attachShader(o,t),e.linkProgram(o),this._watermarkProgram=o,e.deleteShader(l),e.deleteShader(t);let _=13,n=6,p=5,y=document.createElement("canvas").getContext("2d");y.font=`bold ${_}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;let h=y.measureText("NEAT"),f=Math.ceil(h.width),b=_,a=f+n*2,g=b+p*2;this._watermarkWidth=a,this._watermarkHeight=g;let R=document.createElement("canvas");R.width=a,R.height=g;let v=R.getContext("2d");v.clearRect(0,0,a,g),v.shadowColor="rgba(0,0,0,0.4)",v.shadowBlur=2,v.shadowOffsetX=1,v.shadowOffsetY=1,v.font=`bold ${_}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,v.textAlign="center",v.textBaseline="middle",v.fillStyle="rgba(255,255,255,0.5)",v.fillText("NEAT",a/2,g/2);let w=e.createTexture();e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,w),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,R),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),this._watermarkTexture=w;let A=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,A),e.bufferData(e.ARRAY_BUFFER,new Float32Array([0,1,1,1,0,0,1,0]),e.STATIC_DRAW),this._watermarkTexCoordBuffer=A;let x=e.createBuffer();if(e.bindBuffer(e.ARRAY_BUFFER,x),e.bufferData(e.ARRAY_BUFFER,new Float32Array(8),e.DYNAMIC_DRAW),this._watermarkBuffer=x,this._wmLocPos=e.getAttribLocation(o,"a_wm_position"),this._wmLocTc=e.getAttribLocation(o,"a_wm_texcoord"),this._wmLocTex=e.getUniformLocation(o,"u_wm_texture"),i){this._watermarkVAO=r.createVertexArray(),r.bindVertexArray(this._watermarkVAO),e.enableVertexAttribArray(this._wmLocPos),e.bindBuffer(e.ARRAY_BUFFER,x),e.vertexAttribPointer(this._wmLocPos,2,e.FLOAT,!1,0,0),e.enableVertexAttribArray(this._wmLocTc),e.bindBuffer(e.ARRAY_BUFFER,A),e.vertexAttribPointer(this._wmLocTc,2,e.FLOAT,!1,0,0),this._gradientVAO=r.createVertexArray(),r.bindVertexArray(this._gradientVAO);let c=this.glState.locations.attributes;e.enableVertexAttribArray(c.position),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.position),e.vertexAttribPointer(c.position,3,e.FLOAT,!1,0,0),e.enableVertexAttribArray(c.normal),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.normal),e.vertexAttribPointer(c.normal,3,e.FLOAT,!1,0,0),e.enableVertexAttribArray(c.uv),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.uv),e.vertexAttribPointer(c.uv,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,this.glState.buffers.index),r.bindVertexArray(this._gradientVAO)}this._wmClickHandler=c=>{this._licensed||this._isOverWatermark(c)&&(c.preventDefault(),c.stopPropagation(),window.open("https://neat.firecms.co","_blank","noopener"))},this._wmMoveHandler=c=>{if(this._licensed){this._currentCursor!==""&&(this._currentCursor="",this._ref.style.cursor="",document.body.style.cursor="");return}this._wmMoveRafPending||(this._wmMoveRafPending=!0,requestAnimationFrame(()=>{this._wmMoveRafPending=!1;let S=performance.now();(!this._wmCachedRect||S-this._wmRectCacheTime>500)&&(this._wmCachedRect=this._ref.getBoundingClientRect(),this._wmRectCacheTime=S);let u=this._wmCachedRect,T=c.clientX-u.left,M=c.clientY-u.top,P=u.width,F=u.height,U="";if(T>=0&&M>=0&&T<=P&&M<=F){let C=this._watermarkMargin,z=this._watermarkWidth,B=this._watermarkHeight,E=P-C-z,D=F-C-B;T>=E&&T<=P-C&&M>=D&&M<=F-C&&(U="pointer")}this._currentCursor!==U&&(this._currentCursor=U,this._ref.style.cursor=U,document.body.style.cursor=U)}))},document.addEventListener("click",this._wmClickHandler,!0),document.addEventListener("mousemove",this._wmMoveHandler)}_isOverWatermark(e){this._wmCachedRect||(this._wmCachedRect=this._ref.getBoundingClientRect(),this._wmRectCacheTime=performance.now());let r=this._wmCachedRect,i=e.clientX-r.left,l=e.clientY-r.top,t=r.width,o=r.height;if(i<0||l<0||i>t||l>o)return!1;let _=this._watermarkMargin,n=this._watermarkWidth,p=this._watermarkHeight,y=t-_-n,h=o-_-p;return i>=y&&i<=t-_&&l>=h&&l<=o-_}_renderWatermark(e){let r=this._watermarkProgram,i=this._watermarkTexture,l=this._watermarkBuffer;if(!r||!i||!l)return;let t=this._ref.width,o=this._ref.height;if(t===0||o===0)return;let _=4,n=this._watermarkWidth,p=this._watermarkHeight,y=1-_/t*2,h=y-n/t*2,f=-1+_/o*2,b=f+p/o*2,a=this._wmPosData;a[0]=h,a[1]=f,a[2]=y,a[3]=f,a[4]=h,a[5]=b,a[6]=y,a[7]=b,e.bindBuffer(e.ARRAY_BUFFER,l),e.bufferSubData(e.ARRAY_BUFFER,0,a);let g=e,R=this._watermarkVAO!==null;if(e.useProgram(r),e.disable(e.DEPTH_TEST),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),R?(g.bindVertexArray(this._watermarkVAO),e.bindBuffer(e.ARRAY_BUFFER,l),e.vertexAttribPointer(this._wmLocPos,2,e.FLOAT,!1,0,0)):(e.enableVertexAttribArray(this._wmLocPos),e.bindBuffer(e.ARRAY_BUFFER,l),e.vertexAttribPointer(this._wmLocPos,2,e.FLOAT,!1,0,0),e.enableVertexAttribArray(this._wmLocTc),e.bindBuffer(e.ARRAY_BUFFER,this._watermarkTexCoordBuffer),e.vertexAttribPointer(this._wmLocTc,2,e.FLOAT,!1,0,0)),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,i),e.uniform1i(this._wmLocTex,2),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.enable(e.DEPTH_TEST),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.useProgram(this.glState.program),R)g.bindVertexArray(this._gradientVAO);else{let v=this.glState.locations.attributes;e.enableVertexAttribArray(v.position),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.position),e.vertexAttribPointer(v.position,3,e.FLOAT,!1,0,0),e.enableVertexAttribArray(v.normal),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.normal),e.vertexAttribPointer(v.normal,3,e.FLOAT,!1,0,0),e.enableVertexAttribArray(v.uv),e.bindBuffer(e.ARRAY_BUFFER,this.glState.buffers.uv),e.vertexAttribPointer(v.uv,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,this.glState.buffers.index)}}};for(let[d,e,r,i,l]of Tt)Object.defineProperty(te.prototype,d,{get(){return r===1?this[e]:this[e]*r},set(t){let o=i===1?t:t*i;this[e]!==o&&(this[e]=o,this._uniformsDirty=!0,l==="t"&&this._enableProceduralTexture?this._textureNeedsUpdate=!0:l==="g"&&this._updateGeometry())},enumerable:!0,configurable:!0});function Et(){let d=new Date,e=d.getMinutes(),r=d.getSeconds();return e*60+r}function St(){if(document.querySelector('meta[name="generator"][content*="NEAT"]'))return;let d=document.createElement("meta");d.name="generator",d.content="NEAT by FireCMS \u2014 https://neat.firecms.co",document.head.appendChild(d)}var Ft=`
attribute vec2 a_wm_position;
attribute vec2 a_wm_texcoord;
varying vec2 v_wm_texcoord;
void main() {
    gl_Position = vec4(a_wm_position, 0.0, 1.0);
    v_wm_texcoord = a_wm_texcoord;
}
`,Pt=`
precision mediump float;
varying vec2 v_wm_texcoord;
uniform sampler2D u_wm_texture;
void main() {
    gl_FragColor = texture2D(u_wm_texture, v_wm_texcoord);
}
`;export{te as NeatGradient};
//# sourceMappingURL=neat.mjs.map
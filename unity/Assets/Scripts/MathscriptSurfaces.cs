using System.Collections.Generic;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed class MathscriptSurfaces
    {
        public enum Surface { Rock, Concrete, Steel, Paint, Foliage, Bark, Ground }
        private readonly Shader shader;
        private readonly Dictionary<(Surface, Color), Material> materials = new Dictionary<(Surface, Color), Material>();
        private readonly Dictionary<Vector3, Mesh> boxes = new Dictionary<Vector3, Mesh>();
        private readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
        private readonly Dictionary<int, Mesh> foliage = new Dictionary<int, Mesh>();
        private readonly Dictionary<int, Mesh> rocks = new Dictionary<int, Mesh>();
        private Texture2D needleTexture;
        private Texture2D groundTexture;

        public MathscriptSurfaces(Shader surfaceShader)
        {
            shader = surfaceShader;
        }

        public Material GetMaterial(Surface surface, Color tint)
        {
            var key = (surface, tint);
            if (materials.TryGetValue(key, out Material existing)) return existing;
            Material cutout = surface == Surface.Foliage ? Resources.Load<Material>("Surfaces/NeedleCutout") : null;
            var material = cutout != null ? new Material(cutout) : new Material(shader);
            material.name = "Mine " + surface;
            material.color = tint;
            material.enableInstancing = true;
            material.SetFloat("_Metallic", surface == Surface.Steel ? 0.82f : surface == Surface.Paint ? 0.28f : 0);
            material.SetFloat("_Glossiness", surface == Surface.Steel ? 0.38f : surface == Surface.Paint ? 0.26f : 0.08f);
            string folder = surface == Surface.Rock ? "Rock" : surface == Surface.Concrete ? "Concrete" : surface == Surface.Steel || surface == Surface.Paint ? "Metal" : surface == Surface.Bark ? "Bark" : "Foliage";
            Texture2D albedo = GetTexture(folder + "/albedo");
            Texture2D normal = GetTexture(folder + "/normal");
            if (surface == Surface.Foliage)
            {
                if (needleTexture == null) needleTexture = CreateNeedleTexture();
                albedo = needleTexture;
                material.SetFloat("_Mode", 1);
                material.SetFloat("_Cutoff", 0.38f);
                material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.One);
                material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.Zero);
                material.SetInt("_ZWrite", 1);
                material.EnableKeyword("_ALPHATEST_ON");
                material.SetOverrideTag("RenderType", "TransparentCutout");
                material.renderQueue = (int)UnityEngine.Rendering.RenderQueue.AlphaTest;
            }
            if (surface == Surface.Ground)
            {
                if (groundTexture == null) groundTexture = CreateGroundTexture();
                albedo = groundTexture;
                normal = null;
            }
            if (albedo != null) material.mainTexture = albedo;
            material.mainTextureScale = Vector2.one * (surface == Surface.Rock ? 0.38f : surface == Surface.Concrete ? 0.65f : surface == Surface.Foliage ? 1 : surface == Surface.Ground ? 0.9f : 1.6f);
            if (normal != null)
            {
                material.SetTexture("_BumpMap", normal);
                material.SetFloat("_BumpScale", surface == Surface.Rock ? 0.85f : 0.35f);
                material.EnableKeyword("_NORMALMAP");
            }
            materials.Add(key, material);
            return material;
        }

        private Texture2D GetTexture(string path)
        {
            if (!textures.TryGetValue(path, out Texture2D texture))
            {
                texture = Resources.Load<Texture2D>("Surfaces/" + path);
                textures.Add(path, texture);
            }
            return texture;
        }

        public Mesh GetBox(Vector3 size)
        {
            if (boxes.TryGetValue(size, out Mesh existing)) return existing;
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var coordinates = new List<Vector2>();
            var triangles = new List<int>();
            Vector3 half = size * 0.5f;
            float radius = Mathf.Min(0.035f, Mathf.Min(size.x, Mathf.Min(size.y, size.z)) * 0.14f);
            Vector3 inner = half - Vector3.one * radius;
            foreach (Vector3 direction in new[] { Vector3.forward, Vector3.back, Vector3.up, Vector3.down, Vector3.right, Vector3.left })
            {
                Vector3 right = Mathf.Abs(direction.y) > 0.5f ? Vector3.right : Vector3.Cross(Vector3.up, direction);
                Vector3 up = Vector3.Cross(direction, right);
                float extentX = Vector3.Dot(half, Abs(right));
                float extentY = Vector3.Dot(half, Abs(up));
                float extentZ = Vector3.Dot(half, Abs(direction));
                float[] horizontal = { -extentX, -extentX + radius, extentX - radius, extentX };
                float[] vertical = { -extentY, -extentY + radius, extentY - radius, extentY };
                int start = vertices.Count;
                for (int row = 0; row < 4; row++)
                {
                    for (int column = 0; column < 4; column++)
                    {
                        Vector3 point = right * horizontal[column] + up * vertical[row] + direction * extentZ;
                        Vector3 center = new Vector3(Mathf.Clamp(point.x, -inner.x, inner.x), Mathf.Clamp(point.y, -inner.y, inner.y), Mathf.Clamp(point.z, -inner.z, inner.z));
                        Vector3 normal = (point - center).normalized;
                        vertices.Add(center + normal * radius);
                        normals.Add(normal);
                        coordinates.Add(new Vector2(horizontal[column], vertical[row]));
                    }
                }
                for (int row = 0; row < 3; row++)
                {
                    for (int column = 0; column < 3; column++)
                    {
                        int corner = start + row * 4 + column;
                        triangles.Add(corner);
                        triangles.Add(corner + 1);
                        triangles.Add(corner + 5);
                        triangles.Add(corner);
                        triangles.Add(corner + 5);
                        triangles.Add(corner + 4);
                    }
                }
            }
            var mesh = new Mesh { name = "Beveled mine box " + size };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, coordinates);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            boxes.Add(size, mesh);
            return mesh;
        }

        public Mesh GetFoliage(int variation)
        {
            int identity = Mathf.Abs(variation) % 3;
            if (foliage.TryGetValue(identity, out Mesh existing)) return existing;
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var coordinates = new List<Vector2>();
            var triangles = new List<int>();
            for (int tier = 0; tier < 7; tier++)
            {
                float spread = Mathf.Lerp(0.64f, 0.12f, tier / 6f);
                for (int branch = 0; branch < 8; branch++)
                {
                    float angle = (branch / 8f + tier * 0.137f + identity * 0.083f) * Mathf.PI * 2;
                    float irregularity = 0.85f + 0.12f * Mathf.Sin(branch * 7.1f + tier * 3.7f + identity);
                    Vector3 radial = new Vector3(Mathf.Cos(angle), 0, Mathf.Sin(angle));
                    Vector3 center = new Vector3(0, tier * 0.21f + Mathf.Sin(branch * 2.8f + tier) * 0.045f, 0);
                    Vector3 tip = center + radial * spread * irregularity + Vector3.up * (0.3f - spread * 0.18f);
                    Vector3 axis = (tip - center).normalized;
                    Vector3 across = Vector3.Cross(axis, Vector3.up).normalized;
                    for (int plane = 0; plane < 3; plane++)
                    {
                        Vector3 width = Quaternion.AngleAxis(plane * 60 + tier * 7, axis) * across * spread * 0.53f;
                        AddSpray(vertices, normals, coordinates, triangles, center, tip, width);
                    }
                }
            }
            for (int crown = 0; crown < 3; crown++)
                AddSpray(vertices, normals, coordinates, triangles, Vector3.up * 1.22f, Vector3.up * 1.85f, Quaternion.Euler(0, crown * 60, 0) * Vector3.right * 0.12f);
            var mesh = new Mesh { name = "Original needle-spray conifer " + identity };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, coordinates);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            foliage.Add(identity, mesh);
            return mesh;
        }

        private static void AddSpray(List<Vector3> vertices, List<Vector3> normals, List<Vector2> coordinates, List<int> triangles, Vector3 basePoint, Vector3 tip, Vector3 width)
        {
            Vector3 normal = Vector3.Cross(width, tip - basePoint).normalized;
            Vector3[] points = { basePoint - width, basePoint + width, tip + width * 0.7f, tip - width * 0.7f };
            Vector2[] mapping = { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            for (int face = 0; face < 2; face++)
            {
                int start = vertices.Count;
                for (int corner = 0; corner < 4; corner++)
                {
                    vertices.Add(points[corner]);
                    normals.Add(face == 0 ? normal : -normal);
                    coordinates.Add(mapping[corner]);
                }
                int[] winding = face == 0 ? new[] { 0, 1, 2, 0, 2, 3 } : new[] { 0, 2, 1, 0, 3, 2 };
                foreach (int corner in winding) triangles.Add(start + corner);
            }
        }

        public Mesh GetRock(int variation)
        {
            int identity = Mathf.Abs(variation) % 3;
            if (rocks.TryGetValue(identity, out Mesh existing)) return existing;
            const int segments = 12;
            const int rings = 7;
            var vertices = new List<Vector3>();
            var coordinates = new List<Vector2>();
            var triangles = new List<int>();
            for (int ring = 0; ring < rings; ring++)
            {
                float altitude = Mathf.Lerp(-Mathf.PI / 2, Mathf.PI / 2, ring / (float)(rings - 1));
                for (int side = 0; side < segments; side++)
                {
                    float angle = side * Mathf.PI * 2 / segments;
                    float radius = 0.43f + 0.06f * Mathf.Sin(side * 3.7f + ring * 4.1f + identity);
                    vertices.Add(new Vector3(Mathf.Cos(angle) * Mathf.Cos(altitude) * radius, Mathf.Sin(altitude) * 0.48f, Mathf.Sin(angle) * Mathf.Cos(altitude) * radius));
                    coordinates.Add(new Vector2(side / (float)segments, ring / (float)(rings - 1)));
                }
            }
            for (int ring = 0; ring < rings - 1; ring++)
                for (int side = 0; side < segments; side++)
                {
                    int lower = ring * segments + side;
                    int next = ring * segments + (side + 1) % segments;
                    triangles.Add(lower);
                    triangles.Add(lower + segments);
                    triangles.Add(next);
                    triangles.Add(next);
                    triangles.Add(lower + segments);
                    triangles.Add(next + segments);
                }
            var mesh = new Mesh { name = "Original weathered rock " + identity };
            mesh.SetVertices(vertices);
            mesh.SetUVs(0, coordinates);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            rocks.Add(identity, mesh);
            return mesh;
        }

        private static Texture2D CreateNeedleTexture()
        {
            const int width = 128;
            const int height = 256;
            var pixels = new Color32[width * height];
            Stroke(pixels, width, height, new Vector2(64, 5), new Vector2(64, 245), 1.3f, new Color32(133, 146, 92, 255));
            for (int needle = 0; needle < 65; needle++)
            {
                float position = 12 + needle * 3.45f;
                float spread = Mathf.Lerp(44, 10, position / height) * (0.82f + 0.15f * Mathf.Sin(needle * 2.8f));
                for (int side = -1; side <= 1; side += 2)
                {
                    Vector2 start = new Vector2(64, position);
                    Vector2 end = new Vector2(64 + side * spread, position + 20 + Mathf.Sin(needle * 3.1f) * 7);
                    byte brightness = (byte)(158 + needle % 5 * 15);
                    Stroke(pixels, width, height, start, end, 1.5f, new Color32((byte)(brightness * 0.71f), brightness, (byte)(brightness * 0.61f), 255));
                    Stroke(pixels, width, height, Vector2.Lerp(start, end, 0.35f), end + new Vector2(side * 4, 4), 0.7f, new Color32(182, 202, 143, 255));
                }
            }
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, true) { name = "Original evergreen needle atlas", wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, anisoLevel = 2 };
            texture.SetPixels32(pixels);
            texture.Apply(true, false);
            return texture;
        }

        private static void Stroke(Color32[] pixels, int width, int height, Vector2 start, Vector2 end, float radius, Color32 color)
        {
            int steps = Mathf.Max(1, Mathf.CeilToInt(Vector2.Distance(start, end) * 2));
            for (int step = 0; step <= steps; step++)
            {
                Vector2 point = Vector2.Lerp(start, end, step / (float)steps);
                for (int vertical = -2; vertical <= 2; vertical++)
                    for (int horizontal = -2; horizontal <= 2; horizontal++)
                    {
                        int column = Mathf.RoundToInt(point.x) + horizontal;
                        int row = Mathf.RoundToInt(point.y) + vertical;
                        if (column < 0 || column >= width || row < 0 || row >= height) continue;
                        float coverage = Mathf.Clamp01(radius + 0.6f - Vector2.Distance(point, new Vector2(column, row)));
                        if (coverage * 255 <= pixels[row * width + column].a) continue;
                        Color32 shade = color;
                        shade.a = (byte)(coverage * 255);
                        pixels[row * width + column] = shade;
                    }
            }
        }

        private static Texture2D CreateGroundTexture()
        {
            const int size = 128;
            var pixels = new Color32[size * size];
            for (int row = 0; row < size; row++)
                for (int column = 0; column < size; column++)
                {
                    float patch = Mathf.PerlinNoise(column * 0.045f, row * 0.045f);
                    float grain = Mathf.PerlinNoise(column * 0.7f + 4, row * 0.7f + 8);
                    pixels[row * size + column] = Color.Lerp(new Color32(124, 137, 103, 255), new Color32(206, 208, 163, 255), patch * 0.65f + grain * 0.35f);
                }
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, true) { name = "Original grass and soil texture", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, anisoLevel = 2 };
            texture.SetPixels32(pixels);
            texture.Apply(true, false);
            return texture;
        }

        private static Vector3 Abs(Vector3 value) => new Vector3(Mathf.Abs(value.x), Mathf.Abs(value.y), Mathf.Abs(value.z));

        public static Surface Identify(string title)
        {
            switch (title)
            {
                case "Bedrock":
                case "West soil":
                case "East soil":
                case "Rock stratum":
                case "Unexcavated shaft":
                case "Rock outcrop": return Surface.Rock;
                case "Deck":
                case "Back wall":
                case "Ceiling":
                case "Access path":
                case "Rear facade":
                case "West facade":
                case "East facade": return Surface.Concrete;
                case "Lift rail":
                case "Cage frame":
                case "Service conduit":
                case "Ceiling fixture":
                case "Roof":
                case "Antenna mast":
                case "Pipe":
                case "Support beam":
                case "Cable tray":
                case "Terminal stand":
                case "Crate rim":
                case "Crate strap":
                case "Intake chute":
                case "Bolt": return Surface.Steel;
                case "Tree canopy": return Surface.Foliage;
                case "Open land": return Surface.Ground;
                case "Tree trunk":
                case "Tree branch": return Surface.Bark;
                default: return Surface.Paint;
            }
        }

        public void Dispose()
        {
            foreach (Material material in materials.Values) Release(material);
            foreach (Mesh mesh in boxes.Values) Release(mesh);
            foreach (Mesh mesh in foliage.Values) Release(mesh);
            foreach (Mesh mesh in rocks.Values) Release(mesh);
            if (needleTexture != null) Release(needleTexture);
            if (groundTexture != null) Release(groundTexture);
            materials.Clear();
            boxes.Clear();
            foliage.Clear();
            rocks.Clear();
            needleTexture = null;
            groundTexture = null;
            textures.Clear();
        }

        private static void Release(Object resource)
        {
            if (Application.isPlaying) Object.Destroy(resource);
            else Object.DestroyImmediate(resource);
        }
    }
}
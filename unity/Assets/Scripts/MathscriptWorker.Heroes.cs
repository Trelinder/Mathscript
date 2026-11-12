using UnityEngine;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptWorker
    {
        public enum Hero { None = -1, Arcanos, Blaze, Luna, Zenith, Titan, Tempest, Shadow }
        public Hero HeroIdentity { get; private set; } = Hero.None;

        private void ConfigureHeroPalette(Color[] palette)
        {
            Color32[] coats = { new Color32(92,49,139,255), new Color32(204,72,42,255), new Color32(183,48,106,255),
                new Color32(235,225,195,255), new Color32(50,105,73,255), new Color32(48,87,151,255), new Color32(39,48,52,255) };
            Color32[] linings = { new Color32(44,29,74,255), new Color32(77,44,35,255), new Color32(90,29,66,255),
                new Color32(37,68,77,255), new Color32(45,54,45,255), new Color32(27,50,86,255), new Color32(22,31,33,255) };
            Color32[] faces = { new Color32(222,179,145,255), new Color32(204,139,102,255), new Color32(241,201,188,255),
                new Color32(233,188,144,255), new Color32(134,87,62,255), new Color32(161,109,80,255), new Color32(206,157,119,255) };
            Color32[] trims = { new Color32(219,181,86,255), new Color32(228,185,109,255), new Color32(230,191,96,255),
                new Color32(220,173,51,255), new Color32(169,149,103,255), new Color32(185,208,221,255), new Color32(94,153,146,255) };
            Color32[] lights = { new Color32(121,213,233,255), new Color32(255,204,111,255), new Color32(223,236,245,255),
                new Color32(150,218,217,255), new Color32(124,215,137,255), new Color32(152,219,242,255), new Color32(118,226,198,255) };
            Color32[] hair = { new Color32(205,213,223,255), new Color32(136,53,27,255), new Color32(220,228,238,255),
                new Color32(196,144,55,255), new Color32(36,31,28,255), new Color32(41,36,43,255), new Color32(36,33,30,255) };
            Color32[] eyes = { new Color32(67,106,137,255), new Color32(110,71,43,255), new Color32(64,111,135,255),
                new Color32(56,120,115,255), new Color32(109,72,40,255), new Color32(58,106,132,255), new Color32(63,122,111,255) };
            int identity = (int)HeroIdentity;
            palette[0] = coats[identity];
            palette[1] = linings[identity];
            palette[2] = faces[identity];
            palette[3] = trims[identity];
            palette[4] = new Color32(33,35,36,255);
            palette[5] = lights[identity];
            palette[6] = Color.Lerp(faces[identity], new Color32(128,46,55,255), 0.6f);
            palette[7] = hair[identity];
            palette[9] = eyes[identity];
        }

        private void AddHeroCostume()
        {
            switch (HeroIdentity)
            {
                case Hero.Arcanos: AddArcanosCostume(); break;
                case Hero.Blaze: AddBlazeCostume(); break;
                case Hero.Luna: AddLunaCostume(); break;
                case Hero.Zenith: AddZenithCostume(); break;
                case Hero.Titan: AddTitanCostume(); break;
                case Hero.Tempest: AddTempestCostume(); break;
                case Hero.Shadow: AddShadowCostume(); break;
            }
        }

        private void AddHeroFace()
        {
            float width = HeroIdentity == Hero.Titan ? 1.1f : HeroIdentity == Hero.Luna ? 0.96f : 1;
            AddProfile(new[] { new Vector3(0,0.875f,-0.008f), new Vector3(0,0.902f,-0.002f), new Vector3(0,0.938f,0),
                new Vector3(0,0.978f,0), new Vector3(0,1.02f,0), new Vector3(0,1.065f,0.005f),
                new Vector3(0,1.099f,0.006f), new Vector3(0,1.115f,0.006f) },
                new[] { new Vector2(0.032f*width,0.036f), new Vector2(0.059f*width,0.056f), new Vector2(0.08f*width,0.069f),
                    new Vector2(0.091f*width,0.074f), new Vector2(0.087f*width,0.073f), new Vector2(0.078f*width,0.067f),
                    new Vector2(0.049f*width,0.047f), new Vector2(0.009f,0.012f) },3,3,2);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                float eyeX = sign*0.035f*width;
                AddPanel(new Vector3(eyeX,0.992f,-0.076f), new[] { new Vector2(-0.023f,0), new Vector2(-0.011f,0.012f),
                    new Vector2(0.012f,0.012f), new Vector2(0.024f,0), new Vector2(0.011f,-0.009f), new Vector2(-0.012f,-0.009f) },3,8,0.003f);
                AddPanel(new Vector3(eyeX,0.992f,-0.079f), new[] { new Vector2(-0.02f,0), new Vector2(-0.01f,0.009f),
                    new Vector2(0.01f,0.01f), new Vector2(0.02f,0), new Vector2(0.01f,-0.007f), new Vector2(-0.01f,-0.007f) },3,5,0.002f);
                Ellipsoid(new Vector3(eyeX,0.992f,-0.082f),new Vector3(0.009f,0.01f,0.003f),3,9);
                Ellipsoid(new Vector3(eyeX,0.992f,-0.085f),new Vector3(0.004f,0.006f,0.0015f),3,8);
                Ellipsoid(new Vector3(eyeX-0.003f,0.996f,-0.087f),new Vector3(0.002f,0.0025f,0.001f),3,5);
                AddRibbon(new[] { new Vector3(eyeX-sign*0.021f,1.018f,-0.073f), new Vector3(eyeX,1.024f,-0.077f),
                    new Vector3(eyeX+sign*0.022f,1.016f,-0.068f) },new[] { 0.0025f,0.004f,0.002f },0.002f,3,7);
                Ellipsoid(new Vector3(sign*0.09f*width,0.975f,0),new Vector3(0.014f,0.026f,0.016f),3,2);
                Ellipsoid(new Vector3(sign*0.099f*width,0.976f,-0.004f),new Vector3(0.004f,0.016f,0.009f),3,6);
            }
            AddRibbon(new[] { new Vector3(0,1.012f,-0.066f), new Vector3(0,0.967f,-0.098f),
                new Vector3(0,0.956f,-0.088f) },new[] { 0.006f,0.012f,0.011f },0.007f,3,2);
            AddRibbon(new[] { new Vector3(-0.026f,0.925f,-0.063f), new Vector3(-0.009f,0.926f,-0.07f),
                new Vector3(0,0.923f,-0.072f), new Vector3(0.011f,0.926f,-0.07f), new Vector3(0.026f,0.928f,-0.062f) },
                new[] { 0.0015f,0.003f,0.002f,0.003f,0.001f },0.002f,3,6);
            AddRibbon(new[] { new Vector3(-0.019f,0.922f,-0.066f), new Vector3(0,0.915f,-0.069f),
                new Vector3(0.02f,0.924f,-0.065f) },new[] { 0.001f,0.003f,0.001f },0.002f,3,6);
            if (HeroIdentity != Hero.Shadow)
                AddProfile(new[] { new Vector3(0,1.047f,0.033f), new Vector3(0,1.084f,0.024f), new Vector3(0,1.118f,0.014f),
                    new Vector3(0,1.128f,0.01f) },new[] { new Vector2(0.088f,0.061f),new Vector2(0.085f,0.069f),
                        new Vector2(0.057f,0.052f),new Vector2(0.005f,0.006f) },3,3,7);
        }

        private void AddArcanosCostume()
        {
            AddCoat(0.075f,0.245f,0.16f,1);
            AddHem(0.076f,0.249f,0.164f,3);
            AddBelt(3);
            AddCollar(5);
            AddShoulder(-1,0.09f,0);
            AddShoulder(1,0.09f,0);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                AddRibbon(new[] { new Vector3(sign*0.18f,0.09f,-0.097f),new Vector3(sign*0.13f,0.32f,-0.11f),
                    new Vector3(sign*0.074f,0.55f,-0.09f) },new[] { 0.006f,0.007f,0.005f },0.003f,0,3);
                AddPanel(new Vector3(sign*0.066f,0.748f,-0.095f),new[] { new Vector2(0,0.025f),new Vector2(0.012f,0),
                    new Vector2(0,-0.021f),new Vector2(-0.012f,0) },2,5);
            }
            AddProfile(new[] { new Vector3(0,0.715f,-0.09f),new Vector3(0,0.8f,-0.105f),new Vector3(0,0.9f,-0.085f),new Vector3(0,0.934f,-0.065f) },
                new[] { new Vector2(0.009f,0.009f),new Vector2(0.046f,0.019f),new Vector2(0.073f,0.023f),new Vector2(0.06f,0.012f) },3,3,7);
            AddRibbon(new[] { new Vector3(-0.042f,0.806f,-0.126f),new Vector3(-0.022f,0.86f,-0.119f),new Vector3(-0.032f,0.922f,-0.096f) },
                new[] { 0.002f,0.005f,0.002f },0.002f,3,5);
            AddProfile(new[] { new Vector3(0,1.073f,0), new Vector3(0,1.092f,0) },
                new[] { new Vector2(0.272f,0.222f),new Vector2(0.265f,0.218f) },3,3,0);
            AddProfile(new[] { new Vector3(0,1.09f,0),new Vector3(0,1.19f,0),new Vector3(0.016f,1.35f,0),
                new Vector3(0.08f,1.49f,0),new Vector3(0.145f,1.444f,-0.006f) },
                new[] { new Vector2(0.124f,0.112f),new Vector2(0.098f,0.093f),new Vector2(0.065f,0.061f),
                    new Vector2(0.025f,0.023f),new Vector2(0.003f,0.003f) },3,3,0);
            AddHem(1.112f,0.124f,0.114f,3,3);
            AddGem(new Vector3(0,1.163f,-0.096f),0.028f,0.039f,3,5);
            AddProfile(new[] { new Vector3(-0.31f,0.03f,-0.06f),new Vector3(-0.31f,1.19f,-0.06f) },
                new[] { Vector2.one*0.014f,Vector2.one*0.014f },6,6,3,8);
            AddGem(new Vector3(-0.31f,1.32f,-0.06f),0.074f,0.165f,6,5);
        }

        private void AddBlazeCostume()
        {
            AddBelt(4);
            AddCollar(5);
            AddShoulder(-1,0.08f,3);
            AddShoulder(1,0.08f,3);
            AddBracers(4,0.055f);
            AddCape(0.42f,0.22f,0);
            AddPanel(new Vector3(0,0.668f,-0.09f),new[] { new Vector2(-0.09f,0.116f),new Vector2(0.092f,0.116f),
                new Vector2(0.082f,-0.087f),new Vector2(0,-0.105f),new Vector2(-0.082f,-0.087f) },2,1,0.012f);
            AddPanel(new Vector3(0,0.713f,-0.105f),new[] { new Vector2(-0.037f,-0.032f),new Vector2(-0.025f,0.031f),
                new Vector2(0.004f,0.011f),new Vector2(0.028f,0.06f),new Vector2(0.04f,-0.032f) },2,3);
            for (int lockIndex = 0; lockIndex < 5; lockIndex++)
            {
                float offset = (lockIndex-2)*0.03f;
                AddRibbon(new[] { new Vector3(offset,1.064f,-0.039f),new Vector3(offset+0.008f,1.126f,-0.022f),
                    new Vector3(offset+0.018f,1.19f-Mathf.Abs(offset)*0.7f,0) },new[] { 0.022f,0.019f,0.001f },0.025f,3,7);
            }
            AddBootArmor(3,0.065f);
        }

        private void AddZenithCostume()
        {
            AddBelt(3);
            AddCollar(1);
            AddBracers(1,0.038f);
            AddRibbon(new[] { new Vector3(-0.066f,0.804f,-0.092f),new Vector3(-0.056f,0.691f,-0.093f),
                new Vector3(-0.04f,0.57f,-0.085f) },new[] { 0.013f,0.012f,0.014f },0.006f,2,3);
            AddRibbon(new[] { new Vector3(0.038f,0.846f,0.078f),new Vector3(0.16f,0.8f,0.12f),
                new Vector3(0.27f,0.74f,0.14f),new Vector3(0.29f,0.61f,0.09f) },new[] { 0.035f,0.041f,0.034f,0.014f },0.012f,2,1);
            AddRibbon(new[] { new Vector3(-0.074f,1.056f,-0.05f),new Vector3(-0.024f,1.132f,-0.07f),
                new Vector3(0.067f,1.142f,-0.006f),new Vector3(0.092f,1.092f,0.032f) },new[] { 0.017f,0.03f,0.025f,0.004f },0.012f,3,7);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                AddPanel(new Vector3(sign*0.039f,1.066f,-0.083f),new[] { new Vector2(-0.026f,0.018f),new Vector2(0.026f,0.018f),
                    new Vector2(0.026f,-0.015f),new Vector2(-0.026f,-0.015f) },3,3,0.008f);
                AddPanel(new Vector3(sign*0.039f,1.067f,-0.089f),new[] { new Vector2(-0.02f,0.011f),new Vector2(0.02f,0.011f),
                    new Vector2(0.02f,-0.009f),new Vector2(-0.02f,-0.009f) },3,5);
                AddPanel(new Vector3(sign*0.09f,0.095f,-0.069f),new[] { new Vector2(-0.042f,0.033f),new Vector2(0.042f,0.033f),
                    new Vector2(0.034f,-0.028f),new Vector2(-0.034f,-0.028f) },side == 0 ? 12 : 15,5);
            }
        }

        private void AddTitanCostume()
        {
            AddBelt(3);
            AddShoulder(-1,0.133f,1);
            AddShoulder(1,0.133f,1);
            AddBracers(3,0.067f);
            AddPanel(new Vector3(0,0.683f,-0.095f),new[] { new Vector2(-0.132f,0.123f),new Vector2(0.132f,0.123f),
                new Vector2(0.137f,0.015f),new Vector2(0.105f,-0.106f),new Vector2(-0.105f,-0.106f),new Vector2(-0.137f,0.015f) },2,3,0.026f);
            AddPanel(new Vector3(0,0.697f,-0.116f),new[] { new Vector2(-0.088f,0.073f),new Vector2(0.088f,0.073f),
                new Vector2(0.071f,-0.068f),new Vector2(-0.071f,-0.068f) },2,0,0.016f);
            AddGem(new Vector3(0,0.699f,-0.132f),0.033f,0.038f,2,5);
            AddBootArmor(1,0.074f);
            AddProfile(new[] { new Vector3(0,0.894f,-0.01f),new Vector3(0,0.909f,-0.006f),new Vector3(0,0.929f,-0.003f) },
                new[] { new Vector2(0.036f,0.043f),new Vector2(0.061f,0.06f),new Vector2(0.075f,0.067f) },3,3,7);
        }

        private void AddTempestCostume()
        {
            AddCoat(0.24f,0.188f,0.119f,1);
            AddHem(0.241f,0.192f,0.123f,3);
            AddBelt(3);
            AddCollar(3);
            AddShoulder(-1,0.073f,3);
            AddShoulder(1,0.073f,3);
            AddBracers(5,0.045f);
            AddCape(0.25f,0.19f,0);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                AddPanel(new Vector3(sign*0.054f,0.722f,-0.099f),new[] { new Vector2(-0.031f,0.088f),new Vector2(0.031f,0.088f),
                    new Vector2(0.037f,-0.075f),new Vector2(-0.037f,-0.075f) },2,3);
                AddRibbon(new[] { new Vector3(sign*0.051f,1.077f,-0.052f),new Vector3(sign*0.072f,1.127f,0.014f),
                    new Vector3(sign*0.079f,1.105f,0.062f) },new[] { 0.027f,0.027f,0.003f },0.022f,3,7);
            }
            AddHem(1.047f,0.091f,0.079f,3,3);
            AddGem(new Vector3(0,1.055f,-0.084f),0.018f,0.025f,3,5);
        }

        private void AddShadowCostume()
        {
            AddCoat(0.26f,0.165f,0.111f,1);
            AddBelt(3);
            AddBracers(1,0.043f);
            AddRibbon(new[] { new Vector3(-0.11f,0.79f,-0.074f),new Vector3(0,0.68f,-0.099f),
                new Vector3(0.11f,0.572f,-0.076f) },new[] { 0.022f,0.021f,0.02f },0.005f,2,3);
            AddRibbon(new[] { new Vector3(-0.105f,0.902f,0.012f),new Vector3(-0.123f,1.01f,0.018f),
                new Vector3(-0.095f,1.119f,0.023f),new Vector3(0,1.159f,0.027f),new Vector3(0.095f,1.119f,0.023f),
                new Vector3(0.123f,1.01f,0.018f),new Vector3(0.105f,0.902f,0.012f) },
                new[] { 0.02f,0.024f,0.032f,0.03f,0.032f,0.024f,0.02f },0.086f,3,0);
            AddPanel(new Vector3(0,1.028f,0.105f),new[] { new Vector2(-0.09f,-0.104f),new Vector2(0.09f,-0.104f),
                new Vector2(0.093f,0.09f),new Vector2(0,0.13f),new Vector2(-0.093f,0.09f) },3,0,0.015f);
            AddCollar(1);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                AddRibbon(new[] { new Vector3(sign*0.097f,0.27f,-0.095f),new Vector3(sign*0.08f,0.46f,-0.096f),
                    new Vector3(sign*0.065f,0.54f,-0.084f) },new[] { 0.004f,0.004f,0.003f },0.002f,0,5);
            }
        }

        private void AddLunaCostume()
        {
            AddProfile(new[] { new Vector3(0,0.055f,0.035f), new Vector3(0,0.11f,0.035f),
                new Vector3(0,0.3f,0.02f), new Vector3(0,0.48f,0), new Vector3(0,0.57f,0) },
                new[] { new Vector2(0.245f,0.15f), new Vector2(0.24f,0.145f), new Vector2(0.2f,0.12f),
                    new Vector2(0.145f,0.09f), new Vector2(0.135f,0.088f) },0,0,0);
            AddProfile(new[] { new Vector3(0,0.056f,0.035f), new Vector3(0,0.078f,0.035f) },
                new[] { new Vector2(0.249f,0.154f), new Vector2(0.247f,0.153f) },0,0,5);
            AddProfile(new[] { new Vector3(0,0.54f,0), new Vector3(0,0.57f,0) },
                new[] { new Vector2(0.14f,0.096f), new Vector2(0.139f,0.095f) },0,0,3);
            AddProfile(new[] { new Vector3(0,0.48f,0.08f),new Vector3(0,0.7f,0.09f),new Vector3(0,0.93f,0.08f),new Vector3(0,1.086f,0.05f) },
                new[] { new Vector2(0.07f,0.02f),new Vector2(0.091f,0.026f),new Vector2(0.102f,0.037f),new Vector2(0.082f,0.032f) },3,3,7);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                int shoulder = side == 0 ? 4 : 7;
                AddRibbon(new[] { new Vector3(sign*0.066f,1.1f,-0.026f),new Vector3(sign*0.099f,1.021f,-0.012f),
                    new Vector3(sign*0.095f,0.874f,0.031f),new Vector3(sign*0.12f,0.655f,0.042f),
                    new Vector3(sign*0.166f,0.476f,0.019f),new Vector3(sign*0.153f,0.385f,-0.008f) },
                    new[] { 0.019f,0.035f,0.027f,0.029f,0.022f,0.002f },0.019f,3,7);
                AddRibbon(new[] { new Vector3(sign*0.084f,1.05f,-0.024f),new Vector3(sign*0.107f,0.882f,0.009f),
                    new Vector3(sign*0.126f,0.674f,0.022f),new Vector3(sign*0.171f,0.464f,-0.001f) },
                    new[] { 0.002f,0.003f,0.003f,0.001f },0.002f,3,5);
                AddProfile(new[] { new Vector3(sign*0.18f,0.77f,0), new Vector3(sign*0.18f,0.83f,0) },
                    new[] { new Vector2(0.073f,0.065f), new Vector2(0.046f,0.04f) },shoulder,shoulder,5);
                AddProfile(new[] { new Vector3(sign*0.22f,0.44f,0), new Vector3(sign*0.22f,0.49f,0) },
                    new[] { new Vector2(0.033f,0.03f), new Vector2(0.035f,0.031f) },shoulder+1,shoulder+2,3);
            }
            for (int fold = 0; fold < 5; fold++)
            {
                float offset = (fold-2)*0.061f;
                AddProfile(new[] { new Vector3(offset,0.08f,-0.108f), new Vector3(offset*0.75f,0.3f,-0.097f),
                    new Vector3(offset*0.48f,0.48f,-0.081f) },
                    new[] { new Vector2(0.012f,0.009f), new Vector2(0.01f,0.008f), new Vector2(0.004f,0.003f) },0,0,1);
            }
            AddCollar(5);
            AddCrescent(new Vector3(0.089f,1.085f,-0.065f),0.043f,3,3);
            AddCrescent(new Vector3(0,0.768f,-0.101f),0.025f,2,3);
            AddRibbon(new[] { new Vector3(-0.067f,1.051f,-0.066f),new Vector3(-0.026f,1.108f,-0.084f),
                new Vector3(0.043f,1.11f,-0.046f),new Vector3(0.084f,1.039f,-0.018f) },
                new[] { 0.008f,0.019f,0.017f,0.002f },0.009f,3,7);
            for (int star = 0; star < 5; star++)
            {
                float offset = (star % 2 == 0 ? -1 : 1)*(0.061f+star*0.012f);
                AddGem(new Vector3(offset,0.19f+star*0.055f,-0.125f+star*0.006f),0.009f,0.014f,0,3);
            }
        }

        private void AddCollar(int material)
        {
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                AddPanel(new Vector3(sign*0.043f,0.805f,-0.072f),new[] { new Vector2(-0.031f,0.035f),
                    new Vector2(0.031f,0.035f),new Vector2(sign*0.025f,-0.047f) },2,material,0.008f);
            }
        }

        private void AddCoat(float bottom, float width, float depth, int material)
        {
            AddProfile(new[] { new Vector3(0,bottom,0.025f),new Vector3(0,(bottom+0.52f)/2,0.019f),
                new Vector3(0,0.52f,0),new Vector3(0,0.56f,0) },new[] { new Vector2(width,depth),
                    new Vector2(width*0.86f,depth*0.87f),new Vector2(0.142f,0.096f),new Vector2(0.14f,0.093f) },0,0,material);
        }

        private void AddHem(float height, float width, float depth, int material, int bone = 0)
        {
            AddProfile(new[] { new Vector3(0,height,0),new Vector3(0,height+0.02f,0) },
                new[] { new Vector2(width,depth),new Vector2(width*0.993f,depth*0.993f) },bone,bone,material);
        }

        private void AddBelt(int material)
        {
            AddHem(0.535f,0.143f,0.098f,material);
            AddPanel(new Vector3(0,0.547f,-0.104f),new[] { new Vector2(-0.026f,0.017f),new Vector2(0.026f,0.017f),
                new Vector2(0.026f,-0.017f),new Vector2(-0.026f,-0.017f) },0,3,0.008f);
        }

        private void AddShoulder(float sign, float width, int material)
        {
            int bone = sign < 0 ? 4 : 7;
            AddPanel(new Vector3(sign*0.18f,0.786f,-0.028f),new[] { new Vector2(-width,-0.029f),new Vector2(-width*0.82f,0.04f),
                new Vector2(0,0.064f),new Vector2(width*0.82f,0.04f),new Vector2(width,-0.029f),new Vector2(0,-0.045f) },bone,material,0.15f);
            AddPanel(new Vector3(sign*0.18f,0.787f,-0.112f),new[] { new Vector2(-width*0.66f,-0.012f),new Vector2(0,0.035f),
                new Vector2(width*0.66f,-0.012f),new Vector2(0,-0.028f) },bone,3,0.006f);
        }

        private void AddBracers(int material, float width)
        {
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                int bone = side == 0 ? 5 : 8;
                AddProfile(new[] { new Vector3(sign*0.22f,0.432f,0),new Vector3(sign*0.22f,0.526f,0) },
                    new[] { new Vector2(width*0.85f,0.035f),new Vector2(width,0.044f) },bone,bone+1,material,8);
            }
        }

        private void AddBootArmor(int material, float width)
        {
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                int bone = side == 0 ? 11 : 14;
                AddPanel(new Vector3(sign*0.09f,0.174f,-0.047f),new[] { new Vector2(-width,0.104f),new Vector2(width,0.104f),
                    new Vector2(width*0.67f,-0.087f),new Vector2(-width*0.67f,-0.087f) },bone,material,0.026f);
            }
        }

        private void AddHeroBoot(Vector3 ankle, int bone)
        {
            var outline = new[] { new Vector2(-0.052f,-0.12f),new Vector2(0.052f,-0.12f),new Vector2(0.061f,-0.105f),
                new Vector2(0.055f,0.03f),new Vector2(0.042f,0.05f),new Vector2(-0.042f,0.05f),
                new Vector2(-0.055f,0.03f),new Vector2(-0.061f,-0.105f) };
            int offset = vertices.Count;
            float[] heights = { -0.063f,-0.048f,-0.023f,0.012f };
            float[] scales = { 0.99f,1,0.96f,0.82f };
            for (int ring = 0; ring < heights.Length; ring++)
                foreach (Vector2 point in outline)
                    AddHeroVertex(ankle+new Vector3(point.x*scales[ring],heights[ring],point.y*scales[ring]),bone);
            for (int ring = 1; ring < heights.Length; ring++)
            {
                for (int side = 0; side < outline.Length; side++)
                {
                    int previous = offset+(ring-1)*outline.Length+side;
                    int next = offset+(ring-1)*outline.Length+(side+1)%outline.Length;
                    int current = offset+ring*outline.Length+side;
                    int currentNext = offset+ring*outline.Length+(side+1)%outline.Length;
                    Vector2 direction = (outline[side]+outline[(side+1)%outline.Length])/2;
                    Vector3 outward = new Vector3(direction.x,0,direction.y+0.035f);
                    int material = ring == 1 ? 1 : 4;
                    AddHeroTriangle(previous,current,next,material,outward);
                    AddHeroTriangle(next,current,currentNext,material,outward);
                }
            }
            for (int side = 1; side < outline.Length-1; side++)
            {
                AddHeroTriangle(offset,offset+side,offset+side+1,1,Vector3.down);
                int top = offset+(heights.Length-1)*outline.Length;
                AddHeroTriangle(top,top+side,top+side+1,4,Vector3.up);
            }
            AddPanel(ankle+new Vector3(0,-0.002f,-0.064f),new[] { new Vector2(-0.021f,0.013f),new Vector2(0.021f,0.013f),
                new Vector2(0.019f,-0.008f),new Vector2(-0.019f,-0.008f) },bone,3,0.006f);
        }

        private void AddCape(float bottom, float width, int material)
        {
            AddRibbon(new[] { new Vector3(0,0.809f,0.072f),new Vector3(0,0.67f,0.12f),
                new Vector3(0.012f,0.45f,0.17f),new Vector3(0.018f,bottom,0.16f) },
                new[] { 0.119f,width*0.8f,width,width*0.98f },0.012f,2,material);
        }

        private void AddGem(Vector3 center, float width, float height, int bone, int material)
        {
            AddProfile(new[] { center+Vector3.down*height,center,center+Vector3.up*height },
                new[] { Vector2.one*0.001f,new Vector2(width,width*0.55f),Vector2.one*0.001f },bone,bone,material,6);
        }

        private int AddHeroVertex(Vector3 position, int bone)
        {
            int index = vertices.Count;
            vertices.Add(position);
            weights.Add(new BoneWeight { boneIndex0 = bone, boneIndex1 = bone, weight0 = 1, weight1 = 0 });
            return index;
        }

        private void AddHeroTriangle(int first, int second, int third, int material, Vector3 outward)
        {
            Vector3 normal = Vector3.Cross(vertices[second]-vertices[first],vertices[third]-vertices[first]);
            if (Vector3.Dot(normal,outward) < 0)
            {
                int previous = second;
                second = third;
                third = previous;
            }
            triangles[material].Add(first);
            triangles[material].Add(second);
            triangles[material].Add(third);
        }

        private void AddPanel(Vector3 center, Vector2[] outline, int bone, int material, float thickness = 0.006f)
        {
            Vector2 centroid = Vector2.zero;
            foreach (Vector2 point in outline) centroid += point;
            centroid /= outline.Length;
            int frontCenter = AddHeroVertex(center+new Vector3(centroid.x,centroid.y,-thickness/2),bone);
            int backCenter = AddHeroVertex(center+new Vector3(centroid.x,centroid.y,thickness/2),bone);
            int offset = vertices.Count;
            foreach (Vector2 point in outline)
            {
                AddHeroVertex(center+new Vector3(point.x,point.y,-thickness/2),bone);
                AddHeroVertex(center+new Vector3(point.x,point.y,thickness/2),bone);
            }
            for (int side = 0; side < outline.Length; side++)
            {
                int current = offset+side*2;
                int next = offset+(side+1)%outline.Length*2;
                Vector2 direction = (outline[side]+outline[(side+1)%outline.Length])/2-centroid;
                var outward = new Vector3(direction.x,direction.y,0);
                AddHeroTriangle(frontCenter,current,next,material,Vector3.back);
                AddHeroTriangle(backCenter,current+1,next+1,material,Vector3.forward);
                AddHeroTriangle(current,current+1,next,material,outward);
                AddHeroTriangle(next,current+1,next+1,material,outward);
            }
        }

        private void AddRibbon(Vector3[] centers, float[] widths, float thickness, int bone, int material)
        {
            const int sides = 8;
            int offset = vertices.Count;
            for (int ring = 0; ring < centers.Length; ring++)
            {
                Vector3 tangent = centers[Mathf.Min(ring+1,centers.Length-1)]-centers[Mathf.Max(0,ring-1)];
                Vector3 sideways = new Vector3(-tangent.y,tangent.x,0).normalized;
                for (int side = 0; side < sides; side++)
                {
                    float angle = side*Mathf.PI*2/sides;
                    AddHeroVertex(centers[ring]+sideways*(Mathf.Cos(angle)*widths[ring])+Vector3.forward*(Mathf.Sin(angle)*thickness),bone);
                }
                if (ring == 0) continue;
                for (int side = 0; side < sides; side++)
                {
                    int previous = offset+(ring-1)*sides+side;
                    int next = offset+(ring-1)*sides+(side+1)%sides;
                    int current = offset+ring*sides+side;
                    int currentNext = offset+ring*sides+(side+1)%sides;
                    Vector3 outward = (vertices[previous]+vertices[next]+vertices[current]+vertices[currentNext])/4-(centers[ring-1]+centers[ring])/2;
                    AddHeroTriangle(previous,current,next,material,outward);
                    AddHeroTriangle(next,current,currentNext,material,outward);
                }
            }
            for (int side = 1; side < sides-1; side++)
            {
                AddHeroTriangle(offset,offset+side,offset+side+1,material,centers[0]-centers[1]);
                int top = offset+(centers.Length-1)*sides;
                AddHeroTriangle(top,top+side,top+side+1,material,centers[centers.Length-1]-centers[centers.Length-2]);
            }
        }

        private void AddCrescent(Vector3 center, float radius, int bone, int material)
        {
            const int segments = 20;
            int offset = vertices.Count;
            float innerRadius = radius*1.025f;
            float shift = radius*0.55f;
            float intersection = (radius*radius-innerRadius*innerRadius+shift*shift)/(2*shift);
            float outerStart = Mathf.Acos(intersection/radius);
            float innerStart = Mathf.Acos((intersection-shift)/innerRadius);
            for (int sample = 0; sample <= segments; sample++)
            {
                float fraction = (float)sample/segments;
                float outerAngle = Mathf.Lerp(outerStart,Mathf.PI*2-outerStart,fraction);
                float innerAngle = Mathf.Lerp(innerStart,Mathf.PI*2-innerStart,fraction);
                var outside = new Vector3(Mathf.Cos(outerAngle)*radius,Mathf.Sin(outerAngle)*radius,0);
                var inside = new Vector3(shift+Mathf.Cos(innerAngle)*innerRadius,Mathf.Sin(innerAngle)*innerRadius,0);
                AddHeroVertex(center+outside+Vector3.back*0.003f,bone);
                AddHeroVertex(center+inside+Vector3.back*0.003f,bone);
                AddHeroVertex(center+outside+Vector3.forward*0.003f,bone);
                AddHeroVertex(center+inside+Vector3.forward*0.003f,bone);
                if (sample == 0) continue;
                int previous = offset+(sample-1)*4;
                int current = offset+sample*4;
                AddHeroTriangle(previous,current,previous+1,material,Vector3.back);
                AddHeroTriangle(previous+1,current,current+1,material,Vector3.back);
                AddHeroTriangle(previous+2,previous+3,current+2,material,Vector3.forward);
                AddHeroTriangle(previous+3,current+3,current+2,material,Vector3.forward);
                AddHeroTriangle(previous,previous+2,current,material,outside);
                AddHeroTriangle(previous+2,current+2,current,material,outside);
                Vector3 innerNormal = new Vector3(shift,0,0)-inside;
                AddHeroTriangle(previous+1,current+1,previous+3,material,innerNormal);
                AddHeroTriangle(previous+3,current+1,current+3,material,innerNormal);
            }
        }
    }
}
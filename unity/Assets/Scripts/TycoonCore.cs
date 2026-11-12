using System;

namespace MathscriptPrototype
{
    [Serializable]
    public sealed class TycoonCore
    {
        public int version = 1;
        public int stock;
        public int coins;
        public int lifetime;
        public int level = 1;
        public int pendingUnits;
        public int pendingPrice;
        public float productionSeconds;

        public int Capacity => 20;
        public int UpgradeCost => level * 15;
        public int ExpectedAnswer => pendingUnits * pendingPrice;

        public void Tick(float seconds)
        {
            if (float.IsNaN(seconds) || float.IsInfinity(seconds) || seconds <= 0) return;
            productionSeconds += Math.Min(seconds, 1f);
            while (productionSeconds >= 2f)
            {
                productionSeconds -= 2f;
                stock = Math.Min(Capacity, stock + level);
            }
        }

        public bool BeginSale()
        {
            if (stock == 0 || pendingUnits != 0) return false;
            pendingUnits = stock;
            pendingPrice = 3;
            stock = 0;
            return true;
        }

        public bool Answer(int answer)
        {
            if (pendingUnits == 0 || answer != ExpectedAnswer) return false;
            coins += ExpectedAnswer;
            lifetime += ExpectedAnswer;
            pendingUnits = 0;
            pendingPrice = 0;
            return true;
        }

        public bool Upgrade()
        {
            if (level >= 10 || coins < UpgradeCost) return false;
            coins -= UpgradeCost;
            level++;
            return true;
        }

        public bool IsValid()
        {
            return version == 1 && stock >= 0 && stock <= Capacity && coins >= 0
                && lifetime >= coins && level >= 1 && level <= 10
                && pendingUnits >= 0 && pendingUnits <= Capacity
                && pendingPrice == (pendingUnits == 0 ? 0 : 3)
                && !float.IsNaN(productionSeconds) && !float.IsInfinity(productionSeconds)
                && productionSeconds >= 0 && productionSeconds < 2f;
        }
    }
}
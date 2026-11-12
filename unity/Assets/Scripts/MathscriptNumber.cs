using System;
using System.Globalization;

namespace MathscriptPrototype
{
    public static class MathscriptNumber
    {
        private static readonly string[] Suffixes = { "", "K", "M", "B", "T" };
        private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("en-US");

        public static string Compact(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return "--";
            if (Math.Abs(value) < 10000) return Exact(value);
            double scaled = value;
            int unit = 0;
            while (Math.Abs(scaled) >= 1000 && unit < Suffixes.Length - 1)
            {
                scaled /= 1000;
                unit++;
            }
            scaled = Math.Round(scaled, 2, MidpointRounding.AwayFromZero);
            if (Math.Abs(scaled) >= 1000 && unit < Suffixes.Length - 1)
            {
                scaled /= 1000;
                unit++;
            }
            if (Math.Abs(scaled) >= 1000) return value.ToString("0.##e+0", Culture);
            return scaled.ToString("0.##", Culture) + Suffixes[unit];
        }

        public static string Exact(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return "--";
            double rounded = Math.Round(value, 2, MidpointRounding.AwayFromZero);
            return (rounded == 0 ? 0 : rounded).ToString("#,0.##", Culture);
        }

        public static string Money(double value) => "$" + Compact(value);
    }
}
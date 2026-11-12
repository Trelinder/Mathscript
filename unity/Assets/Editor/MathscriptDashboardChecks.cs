using System;
using System.Globalization;
using MathscriptPrototype;
using UnityEngine;

public static class MathscriptDashboardChecks
{
    public static void Run()
    {
        Require(Resources.Load<UnityEngine.UIElements.StyleSheet>("Tycoon/UI/Dashboard") != null, "Dashboard styling is packaged as a Unity resource");
        Require(MathscriptNumber.Compact(0) == "0", "Zero is explicit");
        Require(MathscriptNumber.Compact(7.5) == "7.5", "Small production keeps its precision");
        Require(MathscriptNumber.Compact(1234.56) == "1,234.56", "Thousands are grouped");
        Require(MathscriptNumber.Compact(10000) == "10K", "Compact thousands fit the HUD");
        Require(MathscriptNumber.Compact(999999) == "1M", "Rounding promotes the next unit");
        Require(MathscriptNumber.Compact(1000000) == "1M", "Millions use a stable unit");
        Require(MathscriptNumber.Compact(1250000000) == "1.25B", "Billions fit the HUD");
        Require(MathscriptNumber.Compact(2000000000000) == "2T", "Trillions fit the HUD");
        Require(MathscriptNumber.Compact(1e15) == "1e+15", "Larger values stay bounded");
        Require(MathscriptNumber.Compact(-12500) == "-12.5K", "Signed totals keep their units");
        Require(MathscriptNumber.Exact(-0.001) == "0", "Rounded zero has no negative sign");
        Require(MathscriptNumber.Money(1234.5) == "$1,234.5", "Cash shares the number format");
        Require(MathscriptNumber.Compact(double.NaN) == "--" && MathscriptNumber.Compact(double.PositiveInfinity) == "--", "Invalid values are not plausible totals");
        CultureInfo previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            Require(MathscriptNumber.Compact(1234.56) == "1,234.56" && MathscriptNumber.Compact(12500) == "12.5K", "Display is consistent across operating-system locales");
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
        var state = new MathscriptEconomy();
        Require(state.GenerationYield(0) == 7.5 && state.GenerationYield(1) == 0, "Manual yield distinguishes built and locked departments");
        double yield = state.GenerationYield(0);
        Require(state.Generate(0) && state.bins[0] == yield, "Displayed manual yield matches credited resources");
        Require(state.TotalProduction == 0 && state.EstimatedIncome == 0, "Manual capacity is not reported as automated income");
        Require(state.HireFloor(0) && state.TotalProduction == state.FloorRate(0), "Automated output includes only managed departments");
        Require(state.EstimatedIncome == 0, "Missing pipeline managers do not imply recurring income");
        state.coins = 5000;
        state.HireSector(true);
        state.HireSector(false);
        Require(Math.Abs(state.EstimatedIncome - Math.Min(state.TotalProduction, Math.Min(state.NominalBusRate, state.NominalCompilerRate)) * state.Conversion * state.FlowMultiplier()) < 0.00001, "Income estimate follows the limiting automated stage");
        state.levels[1] = 50;
        double previousStock = state.bins[1];
        yield = state.GenerationYield(1);
        Require(state.Generate(1) && Math.Abs(state.bins[1] - previousStock - yield) < 0.00001, "High-tier manual yield uses the same formula as production");
        Debug.Log("MATHSCRIPT_DASHBOARD_PASS grouped numbers / large units / rounding / locale / truthful production");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}
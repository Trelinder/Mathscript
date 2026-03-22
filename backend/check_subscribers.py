"""
Check premium subscription status for The Math Script app.
Queries both the local PostgreSQL database and Stripe for subscriber data.

Run from the app environment: python backend/check_subscribers.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_database_subscribers():
    """Query app_users table for any premium subscribers."""
    try:
        from backend.database import get_db_connection
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT COUNT(*) FROM app_users
            WHERE subscription_status IN ('active', 'trialing', 'past_due')
        """)
        premium_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM app_users")
        total_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM app_users WHERE stripe_customer_id IS NOT NULL")
        stripe_customers = cur.fetchone()[0]

        cur.execute("""
            SELECT session_id, stripe_customer_id, stripe_subscription_id,
                   subscription_status, created_at, updated_at
            FROM app_users
            WHERE subscription_status != 'free'
               OR stripe_customer_id IS NOT NULL
               OR stripe_subscription_id IS NOT NULL
            ORDER BY updated_at DESC
        """)
        subscribers = cur.fetchall()

        cur.close()
        conn.close()

        print("\n" + "=" * 60)
        print("DATABASE SUBSCRIBER REPORT")
        print("=" * 60)
        print(f"Total users in database:       {total_users}")
        print(f"Users with Stripe customer ID: {stripe_customers}")
        print(f"Premium subscribers (active/trialing/past_due): {premium_count}")

        if subscribers:
            print(f"\nDetailed subscriber records ({len(subscribers)}):")
            print("-" * 60)
            for row in subscribers:
                print(f"  Session:      {row[0]}")
                print(f"  Customer ID:  {row[1] or 'N/A'}")
                print(f"  Sub ID:       {row[2] or 'N/A'}")
                print(f"  Status:       {row[3]}")
                print(f"  Created:      {row[4]}")
                print(f"  Updated:      {row[5]}")
                print("-" * 60)
        else:
            print("\nNo premium subscribers or Stripe-linked users found.")

        return {
            "total_users": total_users,
            "stripe_customers": stripe_customers,
            "premium_count": premium_count,
            "subscribers": [
                {
                    "session_id": r[0],
                    "stripe_customer_id": r[1],
                    "stripe_subscription_id": r[2],
                    "subscription_status": r[3],
                    "created_at": str(r[4]) if r[4] else None,
                    "updated_at": str(r[5]) if r[5] else None,
                }
                for r in subscribers
            ],
        }
    except Exception as e:
        print(f"\nDatabase check failed: {e}")
        return None


def check_stripe_subscribers():
    """Query Stripe API for any active subscriptions."""
    try:
        from backend.stripe_client import get_stripe_client
        client = get_stripe_client()

        all_subs = []
        for status in ["active", "trialing", "past_due", "canceled", "unpaid"]:
            subs = client.v1.subscriptions.list(params={"status": status, "limit": 100})
            all_subs.extend(subs.data)

        print("\n" + "=" * 60)
        print("STRIPE SUBSCRIBER REPORT")
        print("=" * 60)
        print(f"Total subscriptions found: {len(all_subs)}")

        if all_subs:
            active = [s for s in all_subs if s.status == "active"]
            trialing = [s for s in all_subs if s.status == "trialing"]
            past_due = [s for s in all_subs if s.status == "past_due"]
            canceled = [s for s in all_subs if s.status == "canceled"]

            print(f"  Active:    {len(active)}")
            print(f"  Trialing:  {len(trialing)}")
            print(f"  Past Due:  {len(past_due)}")
            print(f"  Canceled:  {len(canceled)}")

            print(f"\nDetailed subscription records:")
            print("-" * 60)
            for sub in all_subs:
                print(f"  Subscription ID: {sub.id}")
                print(f"  Customer:        {sub.customer}")
                print(f"  Status:          {sub.status}")
                if hasattr(sub, 'trial_end') and sub.trial_end:
                    from datetime import datetime
                    trial_end = datetime.fromtimestamp(sub.trial_end)
                    print(f"  Trial Ends:      {trial_end}")
                if hasattr(sub, 'current_period_end') and sub.current_period_end:
                    from datetime import datetime
                    period_end = datetime.fromtimestamp(sub.current_period_end)
                    print(f"  Period Ends:     {period_end}")
                metadata = sub.metadata if hasattr(sub, 'metadata') else {}
                if metadata:
                    print(f"  Metadata:        {dict(metadata)}")
                print("-" * 60)
        else:
            print("\nNo subscriptions found in Stripe.")

        return {
            "total": len(all_subs),
            "active": len([s for s in all_subs if s.status == "active"]),
            "trialing": len([s for s in all_subs if s.status == "trialing"]),
            "past_due": len([s for s in all_subs if s.status == "past_due"]),
            "canceled": len([s for s in all_subs if s.status == "canceled"]),
        }
    except Exception as e:
        print(f"\nStripe check failed: {e}")
        return None


if __name__ == "__main__":
    print("\n🔍 Checking premium subscribers for The Math Script...")

    db_result = check_database_subscribers()
    stripe_result = check_stripe_subscribers()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    if db_result:
        print(f"Database: {db_result['premium_count']} premium subscriber(s) "
              f"out of {db_result['total_users']} total user(s)")
    else:
        print("Database: Could not connect")

    if stripe_result:
        print(f"Stripe:   {stripe_result['active'] + stripe_result['trialing']} "
              f"current subscriber(s), {stripe_result['canceled']} canceled")
    else:
        print("Stripe:   Could not connect")

    if db_result and stripe_result:
        has_any = db_result["premium_count"] > 0 or stripe_result["active"] > 0 or stripe_result["trialing"] > 0
        print(f"\nHas the app had any premium subscribers? {'YES' if has_any else 'NO'}")
        total_ever = stripe_result["total"]
        if total_ever > 0:
            print(f"Total subscriptions ever created (including canceled): {total_ever}")
    print()

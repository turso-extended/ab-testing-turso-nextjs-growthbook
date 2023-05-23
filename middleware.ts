import { NextRequest, NextResponse } from 'next/server'
import { geolocation } from '@vercel/edge'
import { tursoClient } from './utils/tursoClient';
const { GrowthBook } = require("@growthbook/growthbook");

export const runtime = 'experimental-edge'

export async function middleware(req: NextRequest) {
  const { nextUrl: url } = req;
  let { city, country } = geolocation(req)

  if(typeof city !== "string"){
    city = ""
  }
  
  if(url.pathname === "/"){
    url.searchParams.set('city', city)
  }

  if(url.pathname.startsWith("/add-new")){
    // redirect to log-in page when not logged in
    const userId = req.cookies.get("userId")?.value;
    if(!userId){
      url.searchParams.set('error', 'Log in first')
      console.log("Please Log in first")
      return NextResponse.redirect(url.origin + "/log-in")
    }

    // Get user information
    const user = await tursoClient.execute({
      sql: "Select count(*) as total_contributions from contributions where user_id = ?",
      args: [userId]
    });

    const previousContributions = user.rows[0]["total_contributions"];

    // Apply a/b test
    const gB = new GrowthBook({
      apiHost: process.env.GB_API_HOST,
      clientKey: process.env.GB_CLIENT_KEY,
      enableDevMode: true,
      attributes: {
        "id": userId,
        "city": city,
        "loggedIn": !!userId,
        "previousContributions": previousContributions || 0,
        "country": country,
        "url": url.href
      },
      // Only required for A/B testing
      // Called every time a user is put into an experiment 
      trackingCallback: (experiment: any, result: any) => {
        // TODO: Use your real analytics tracking system
        console.log("Viewed Experiment", {
          experimentId: experiment.key,
          variationId: result.key
        });
      }
    });
    
    // Wait for features to be available
    await gB.loadFeatures({ autoRefresh: true });

    // Usage
    if(gB.isOn("add-contribution-incentivizing-message")) {
      console.log("GB is on")
      url.searchParams.set('show_contribution_incentive_message', "Enabled!")
    } else {
      console.log("GB is off")
      url.searchParams.set('show_contribution_incentive_message', "Disabled!")
    }
  }

  return NextResponse.rewrite(url)
}
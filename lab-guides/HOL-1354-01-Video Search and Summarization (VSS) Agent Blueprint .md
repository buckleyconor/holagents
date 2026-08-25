
ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.

## Table of Contents
- [1. Introduction](#introduction)
- [2. Explore the VSS UI](#module-1-explore-the-vss-ui)
- [2. Generating Scenario Highlights](#module-2-generating-scenario-highlights)
- [3. Creating Alerts](#module-3-creating-alerts)
- [4. Summary](#summary)


### Lab Credentials:
- Username/Password : demouser / Password123! 

### Target Audience
- Dell field technical specialists
- AI Solution architects 

Tip! The Kubernetes Pods can take up to 10mins to start so please give the some time after deploying before starting. 

## Introduction
Welcome to the NVIDIA Blueprint for Video Search and Summarization Hands-on Lab (We will refer to this as the "NVIDIA BP for VSS" from here onwards). This hands-on lab provides a comprehensive understanding of NVIDIA BP for VSS key features. We suggest following the lessons in order, as some features within the Blueprint have not been enabled due to resource contraints. That being said, feel free to explore after you have completed the modules.

Throughout this lab, you'll explore the NVIDIA BP for VSS, its capabilities, and practical applications. The NVIDIA BP for VS makes it easy to start building and customizing video analytics AI agents. These insightful, accurate, and interactive agents are powered by generative AI, vision language models (VLMs), large language models (LLMs), and NVIDIA NIM™ Microservices—helping a variety of industries make better decisions, faster. They can be given tasks through natural language and perform complex operations like video summarization and visual question-answering, unlocking entirely new application possibilities.

**Duration:** This lab is designed to be completed in approximately 60 minutes.

**Note:** This lab features only Agent and offline processing, the real-time video alerts/analysis are not available due to the requirement of a live-video feed. 

**Objective:** The objective of this lab is to familiarize you with the capabilities of the NVIDIA BP for VSS, allowing you to:

- Explore the essential features of the NVIDIA BP for VSS
- Understand how to the VSS BP can batch-process video clips, providing captioning for every video which in turn makes the video completely searchable and can be interrogated by users in natural language.
- Enable live-captioning of video streams, providing real-time alerts to be setup, triggered on any rule-set the customer wishes. 
- Build video analytics AI agents that can analyze, interpret, and process vast amounts of video data at scale.
- Produce summaries of long videos up to 100X faster than going through the videos manually.
- Augment traditional computer vision pipelines with VLMs to provide deep video understanding.
- Provide a range of optimized deployments, that scale from from the enterprise edge, to datacenter scale.

**Lesson Completion:** The completion time for each lesson may vary depending on your chosen tasks and exploration.

[Back to top](#table-of-contents)


## Module 1: Explore the VSS UI
In this module we will explore the UI that controls the VSS agent.


1\. On the desktop, please note a folder called "Sample Videos and Prompts" we will use these later in the lab. For now, you can launch the browser.\
\
![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/desktop.png "Click to enlarge"){data-modal=true}

If the browser doesn't automatically direct you to the VSS UI, then the URL to browse to is https://10.110.73.211:9000

2\. This is the main UI for VSS, the main areas to take note of are the Top left corner is where we will upload our sample videos and the main work area in the center where the summaries are posted along with the interface where we will be able to query the uploaded video with natural language. 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/VSS%20UI.png "Click to enlarge"){data-modal=true}

3\. One the left hand side, we have the Prompt section where we can customize our queries specific to the type of videos we are uploading. 
- An overall prompt section will define the type of video source we are reviewing and what specific events/actions/objects we should be monitoring for.  
- A Caption Summarization Prompt; This is where we configure the type of captions we will asign to the specified events from the first prompt, create timestamps and event descriptions
- A Summary Aggregration Prompt; This takes all of the generated captions and assigns the events into specified 'buckets', this gives a full aggregation of all events from the 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/Prompt%20Pane.png "Click to enlarge"){data-modal=true}

**Tip:** VSS is broken down into 3 major areas of video processing and analysis: 
- **Real-time video intelligence:** The Real-Time Video Intelligence layer extracts rich visual features, semantic embeddings, and contextual understanding from video data in real-time, publishing results to a message broker for downstream analytics and agentic workflows. It provides three core microservices for processing video streams.
- **Downstream analytics:** The Downstream Analytics layer processes and enriches the metadata streams generated by real-time video intelligence microservices, transforming raw detections into actionable insights and verified alerts.
- **Agent and offline processing:** The top-level agent leverages the Model Context Protocol (MCP) to access video analytics data, incident records, and vision processing capabilities through a unified tool interface. It integrates multiple vision-based tools including video understanding with Vision Language Models (VLMs), semantic video search using embeddings, long video summarization for extended footage analysis, and video snapshot/clip retrieval.

**Note:** In this lab environment, we will use pre-recorded video clips (No live video feed for live analysis)

4\. Next we will upload one of our sample videos to the VSS UI. We have multiple sample videos divided into different Industry Verticals / Applications; Retail, Manufacturing, Public Services. For our first sample, we will go with Retail - select the "Click Here to Upload Video" and select the "Desktop\Sample Video and Prompts\Retail\Retail - checkout CCTV.mov" file. 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/uploaded%20video.png "Click to enlarge"){data-modal=true}

5\. The video takes a couple of seconds to upload and then the preview screen shows the video playing. We are now going to customize our prompts for this video type. We want to tell the VSS system what kidn of scene this is and what kind of events/objects to watch out for. We have already prepared some sample prompts for each video in the same folder as the video, go ahead and open up "Desktop\Sample Video and Prompts\Retail\Retail Checkout Prompts.txt"

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/Retail%20-%20Checkout%20Prompts.png "Click to enlarge"){data-modal=true}

6\. In each of the prompt files, we have 3 sections corresponding with the prompt boxes on the VSS UI. Review all three prompts, and lets copy/pastse them into the relevant locations on the VSS UI. (Copy/paste all 3 prompts now)

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/copy-paste-prompts.png "Click to enlarge"){data-modal=true}

7\. The VSS GUI will review the uploaded video and automatically set the chunk size (This is the length of pieces/chunks that the main video will be broken down into before being analysed and captioned. Depending on the length of the overall video (could be hours, you may want to make the chunk size larger) For these sample videos, they are under 5 mins, so a chenk size of 10 seconds is completely adequate.

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/chunk_size.png "Click to enlarge"){data-modal=true}

8\. Scroll to the bottom of the page and click "Summarize" the clip is ingested into the VSS pipeline and broken into chunks that were previously configured. The VSS agent then orchestrates each chunk being passed through the vision model (VLM) and basic captions created for each chunk describing what is going on in that scene/chunk. All of these captions are stored in the same manner as a RAG system, making every caption searchable. The VSS agent then takes the prompts that we configured and submits these to the LLM which can build a summary of all of the events it retrieves from the output from the Vision Model (captions) and any other specific queries we have in the prompts.  
In this lab, the initial summarization takes approximately 25% of the duration of the uploaded clip (So for our 5minute clip, the initial analysis takes about 1min30 to complete)

9\. You will get an output in the main pane of the UI, You can see here it's divided into two sets of events, one set is looking for any unusual events, or suspected shoplifting, and the second set of results is a rough count of the number of items purchased per customer (another good metric to identify stock loss as it should tally with number of items scanned)

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/outputs.png "Click to enlarge"){data-modal=true}

10\. The uploaded clip is now ready for any additional questions or deep dives into what happened in the video, For example; There was a man in a red cap who I noticed was behaving unusually during the checkout process, we should ask the VSS system to report back all events specific to this. 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/ad-hoc-questions.png "Click to enlarge"){data-modal=true}

11\. Review the detailed results for all instances of "Man in red cap" - This is an incredibly powerful tool, imagine this at scale, the ability to review hundreds of hours of video footage with a natural language query, in minutes! The output returns all instances with timestamps associated so can skip straight to that timestamp in the oiginal video to review. 

**Tip:** To reset the chat/lab, click the Reset Chat button and reload the webpage from the browser. 

12\. You can repeat Steps 1-11 with the various sample videos and prompts that are provided on the desktop or in the Samples tab on the UI. We have organised them into different industry verticals. 

Retail 
 - Retail - Checkout CCTV
 - Retail - Food Court Scene
 - Retail - Hardware Yard Scene

Manufacturing
 - Manufacturing - Warehouse (5mins) [in the Samples Tab]
 - Manufacturing - Warehouse (82mins) [in the Samples Tab]

Public Services	
 - Public Services - Street Scene
 - Public Services - Drone Bridge Inspection [in the Samples Tab]
 - Public Services - Intelligent Transportation Systems (ITS) [in the Samples Tab]



[Back to top](#table-of-contents)


## Module 2: Generating Scenario Highlights
In this module you will use the NVIDIA VSS BP system to generate specific scenario highlights of a video.

**Use Case:** When you know that a specifi incident occurred and are searching for it, the "Generate Scenario Highlights" is a great tool for being able to search for a specific scenario, and the result provides the specific chunk of video that captures the incident. This can save hundreds of hours of manually reviewing CCTV footage, for example, In the case of a missing person, Police need to review hundreds/thousands of hours of public CCTV in order to build a timeline of the person's last known movements. Imagine the speed at which they could search acrross hundreds of video feeds in parallel with just a description of the missing person! 

1\. To reset the chat/lab, click the Reset Chat button and reload the webpage from the browser.

2\. In this exercise, we are going to use one of the clips from a Warehouse Scene, this clip is already uploaded in the VSS BP, we can find it by clicking the "Samples" tab on the left hand pane. Click Samples, double click the Warehouse clip to load it into preview window (The prompts for this scene are automatically loaded, but can be modified if you wish) and finally click "Summarize" in order to process this clip through VSS BP. 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/warehouse_sample.png "Click to enlarge"){data-modal=true}

3\. Once the Summary of the clip appears in the Results pane, scroll down to the "Ask a Question" section of the UI and click on "Generate Scenario Highlight"

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/generate_scenario_highlight.png "Click to enlarge"){data-modal=true}

4\. The "Generate Scenario Highlight" pop-up will prompt you for what type of scenario you are searching for, In this case we know that there were various incidents relating to boxes in the warehouse scene, so we can search for "box" or can be even more specific by searching for terms like "white","shirt" if we are searching for all incidents around a person wearing a white shirt for example. Lets try "box" for now, but feel free to search for any object/action afterwards. Click "Generate Scenario Highlight"

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/generate_scenario_highlight2.png "Click to enlarge"){data-modal=true}

5\. The results take a few seconds, but you will see this time they return specific video clips along with the full descriptions on what happens in the video, you can click on any of the descriptions and it will play that specific section of video instantly! 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/generate_scenario_highlight_result.png "Click to enlarge"){data-modal=true}

6\. Feel free to try any of the other sample videos and "Generate Scenario Highlight" in order to see the power of this tool. Don't forget to reset the chat/lab between clips, click the Reset Chat button and reload the webpage from the browser.

[Back to top](#table-of-contents)


## Module 3: Creating Alerts
In this module you will use the NVIDIA VSS BP system to generate pre-defined alerts that will trigger as videos are analysed. 


**Use Case:** When you have specific events/objects that you want to trace and alert for (For example on a production line, maybe you want an alert when an object is in a specific state or orientation, such as canning line where a can has fallen over) The NVIDIA VSS BP can be configured to generate alerts when such an event happens. These alerts can be incorporated to existing business processes to generate actions based on the alerts. 

1\. For the warehouse sample clip, lets setup an alert for multiple different scenarios/objects and demonstrate how the NVIDIA VSS BP can detect specific events and trigger alerts. Lets load up the warehouse sample video again, Click Samples, Warehouse, you will see the preview of the video in the Preview window. Now click the "Create Alerts" Tab in the left hand pane, then Click "Add Alert". 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/alerts_tab.png "Click to enlarge"){data-modal=true}

2\. On the "Add Alert" pop-up we can create an alert, give the alert an identifiable name and the Event or Object that you want to alert on. In our case we want an alert that detects drop and box. Click Save. 

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/add_alert.png "Click to enlarge"){data-modal=true}

3\. Multiple alerts can be created, as you can see below, if a video clip is categorised or labelled as "inefficient" we will be alerted, or the prescence of a forkift

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/alert_list.png "Click to enlarge"){data-modal=true}

4\. When we are finished setting up the alerts, we can then process the video by clicking Summarize. After a few seconds once the video is processed, we can view the alert results

![Image](/ImageProxy?filename=817fdf95-e85e-4144-9ee7-405f2aab3d36/alert_results.png "Click to enlarge"){data-modal=true}

5\. Customer can use these alerts to be integrated into existing business processes to trigger actions based on the alerts. (For a dropped box could trigger a notification/warning to other warehouse operators for example)

[Back to top](#table-of-contents)

This concludes the Hands on Lab for NVIDIA Video Search and Summarization Agent. 

## Summary

**NVIDIA Video Search and Summarization Agent Blueprint Key Benefits:**
- Build video analytics AI agents that can analyze, interpret, and process vast amounts of video data at scale.
- Produce summaries of long videos up to 100X faster than going through the videos manually.
- Accelerate development time by bringing together various generative AI models and services to quickly build AI agents.
- Augment traditional computer vision pipelines with VLMs to provide deep video understanding.
- Provide a range of optimized deployments, from the enterprise edge to cloud



[Back to top](#table-of-contents)


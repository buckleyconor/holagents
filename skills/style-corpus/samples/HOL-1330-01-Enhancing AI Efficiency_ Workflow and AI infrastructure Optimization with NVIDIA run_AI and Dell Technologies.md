ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.

## Table of Contents

- [1. Introduction](#introduction)
- [2. Explore the cluster / Configure Quotas](#module-1-explore-cluster-and-configure-quotas)
- [3. Creating Workload Assets](#module-2-creating-workload-assets)
- [4. Deploying a workload](#module-3-deploying-a-workload)
- [5. Summary](#summary)

### Lab Credentials:

- Username/Password : test@run.ai / Password123!

### Target Audience

- Dell field technical specialists
- AI Solution architects

**Tip!** The Kubernetes Pods can take a little while to start so please give the lab 5 minutes after deploying before starting.

## Introduction

Welcome to the NVIDIA run:AI Hands-on Lab. This hands-on demonstration provides a comprehensive understanding of NVIDIA run:AI's key features. We suggest following the lessons in order as configurations made earlier in the guide are utilized in later lessons. That being said, feel free to explore after you have completed the modules.

Throughout this lab, you'll explore NVIDIA run:AI's UI, its capabilities, and practical applications. You'll learn how NVIDIA run:AI helps increase utilization on your AI cluster through it's scheduling techniques and GPU fractioning, speeding up your time to market and increasing your ROI. You'll also learn how the complexities of Kubernetes can be abstracted away from end users who lack infrastructure experience whilst giving control back to infrastructure teams.

**Duration:** This lab is designed to be completed in approximately 60 minutes.

**Objective:** The objective of this lab is to familiarize you with the capabilities of NVIDIA run:AI, allowing you to:

- Explore the essential features of NVIDIA run:AI.
- Understand how to monitor and assess the utilization of your Dell AI infrastructure.
- Learn how NVIDIA run:AI can increase utilization and therefore improve ROI on your Dell AI Infrastructure.
- Enhance productivity by abstracting Kubernetes away from end users and simplifying how they consume your Dell AI Infrastructure

**Hands-on Experience:** During this lab, you will gain practical experience and will be able to do the following:

- Navigate the NVIDIA run:AI interface and dashboard.
- Identify Utilization of your Dell AI Infrastructure.
- Understand the concepts and usage of NVIDIA run:AI workload assets.
- Deploy workloads using NVIDIA run:AI.
- Troubleshoot workloads within NVIDIA run:AI

**Lesson Completion:** The completion time for each lesson may vary depending on your chosen tasks and exploration.

**Please note that the NVIDIA run:AI demonstration is conducted using a simulator. As a result, no real GPU workloads can be run in this environment.**

[Back to top](#table-of-contents)

## Module 1: Explore Cluster and Configure Quotas

In this module we will explore the cluster via the NVIDIA run:AI interface and then configure quotas at different hierarchical levels.

#### Lesson 1: Exploring the Cluster

In this lesson we will explore the cluster within the NVIDIA run:AI interface.

1\. From the desktop, launch your browser.\

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20150739.png 'Click to enlarge'){data-modal=true}

This will open with the sign in screen for run:AI

2\. Click the "**Email**" field.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20150818.png 'Click to enlarge'){data-modal=true}

3\. Username is "**test@run.ai**", Password is "**Password123!**"

4\. Click "**Sign In**".

5\. Click **Resources**.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151002.png 'Click to enlarge'){data-modal=true}

6\. Here you will see the Dell PowerEdge XE9680 Cluster. Now click "**Nodes**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151212.png 'Click to enlarge'){data-modal=true}

**Use Case!** With NVIDIA run:AI a single control plane can manage multiple clusters in multiple locations. This provides your organization a centralized AI platform, regardless of which cluster you wish to deploy workloads on or their location.

7\. Here you will see the Dell PowerEdge XE9680 Nodes. We have 3 with 8 NVIDIA H200 141GB GPUs each (Please note these GPUs are fake and you will not be able to run real GPU workloads).

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151312.png 'Click to enlarge'){data-modal=true}

**Tip!** By selecting the tick box next to a node and then clicking the "**More Details**" option in the top right, you can see usage metrics for each node.

**Tip:** Congratulations, you've explored the cluster within the NVIDIA run:AI interface.

#### Lesson 2: Configuring Departments

In this lesson we will learn about Departments and configuring their Quota.

1\. Click "**Organization**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151312.png 'Click to enlarge'){data-modal=true}

2\. Click "**Departments**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151353.png 'Click to enlarge'){data-modal=true}

3\. A department is the top hierarchical level within a cluster. You can see in this lab there are two departments currently configured, Manufacturing already has 6 GPU's assigned and 'default' department has 0 GPU's assigned. Select the "**default**" department.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151449.png 'Click to enlarge'){data-modal=true}

4\. Click "**Edit**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151528.png 'Click to enlarge'){data-modal=true}

5\. A Department allows you to configure a resource quota (GPU/CPU/Memory) which is a guaranteed amount of resource when it needs it. However with NVIDIA run:AI's over-quota option, another Department can utilise this resource if you are not, until you need access to it again. This ensures high utilization across the cluster and faster job completion. Now select the GPU Quota field and set it to "18" (The remainder of the 24 GPU's). Click **Save & Continue**

**Use Case!** As an example, imagine you are using your cluster for inferencing and have some models in production here. Let's assume these models serve your organization or clients during the working day, 9-5. Rather than allow this resource to sit idle over night outside of those hours, NVIDIA run:AI can automatically allow your training workloads to utilize this capacity, whilst still providing the guarantee to your inferencing workloads when they need it again. The end outcome? Your model training and experiments are faster to complete, meaning a higher return from your hardware investment. The GPU over quota screen gives you the option to rank and weight each of your department's ability to schedule and give GPU preference to specific workloads/projects.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151831.png 'Click to enlarge'){data-modal=true}

6\. Click "Save & Continue"

On the next screens you can configure CPU and Memory resouce allocation for the department, in our case, we want unlimted CPU/Memory, so set the values for both fields to '-1' (unlimted)

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20151945.png 'Click to enlarge'){data-modal=true}

7\. Click "Save & Continue"

8\. Scheduling Rules: Scheduling rules are restrictions applied to workloads. These restrictions apply to either the resources (nodes) on which workloads can run or the duration of the run time. Scheduling rules are set for Projects or Departments and apply to specific workload types. For the purpose of this lab, we will not implement any scheduling rules, just hit "Save and Continue" and "Close"

**Tip!** No workloads run directly in a Department, this is a hierarchal level for permissions and quota only, a bit like a resource pool.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20152139.png 'Click to enlarge'){data-modal=true}

Congratulations, you have configured your first Department.

[Back to top](#table-of-contents)

#### Lesson 3: Creating and Configuring Projects

In this lesson you will create a project and configure it with a quota.

1\. Select "**Projects**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20152139.png 'Click to enlarge'){data-modal=true}

2\. A Project is a child of a Department and where workloads actually run. Click "**New Project**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20152215.png 'Click to enlarge'){data-modal=true}

3\. If you click the Heirarchy Tree icon, You will see here that default is automatically selected as the project parent. Click Apply

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20152301.png 'Click to enlarge'){data-modal=true}

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20152842.png 'Click to enlarge'){data-modal=true}

4\. Give your project a name and description. I chose "robotics". If you expand the namespace option you can see that a project is tied to a kubernetes namespace, leave this set as "**Create from the project name"**. Click Create Project and Continue.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20153019.png 'Click to enlarge'){data-modal=true}

5\. Next select the **GPU Quota** option and set it to something less than 18. You can see this quota is coming out of the parent department's quota.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20153112.png 'Click to enlarge'){data-modal=true}

You can see if you expand the Department Quota Overview that you can adjust other projects in the same department's GPU quota on the fly. Click "**Save and Continue**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20153154.png 'Click to enlarge'){data-modal=true}

6\. We are going to leave the default settings for GPU Over Quota, CPU/Memeory Quota, Scheduling Rukes and Access rules, so just click Save and Continue for each screen, These options allow control over resources can be put right down to the project level.

7\. Click "**Close**"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-02-27%20153543.png 'Click to enlarge'){data-modal=true}

Congratulations, you have successfully created and configured your first project.

[Back to top](#table-of-contents)

## Module 2: Creating Workload Assets

In this module you will create the workload assets used to deploy new workloads.

**Use Case:**
The concept of workload assets enables the creation of a fully customizable service catalog for end users. This ensures that the tools they require to perform their tasks are readily accessible whenever needed. See for yourself...

#### Lesson 1: Environment Assets

In this lesson you will learn what an environment asset is and what can be configured within it.

1\. Click "Workload manager"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115253.png 'Click to enlarge'){data-modal=true}

2\. This is where your workloads are managed. When using the UI, we use assets to abstract Kubernetes away from the end user. Select Environments first.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115350.png 'Click to enlarge'){data-modal=true}

3\. An Environment is built around a container image. Any accessible container image can be used in an environment. These environments are essentially templates providing the tools, libraries and frameworks to perform a function and can be tailored to a specific step of the AI lifecycle.
There are 3 types of workloads that can be configured in an environment:

- A Workspace which is an interactive workload, usually for IDE environments like Jupyter.
- A training workload which is a traditional batch workload used for training models
- The inference workload which is for running models in production.

Select the jupyter-example environment, and click Edit

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115521.png 'Click to enlarge'){data-modal=true}

4\. You can set the container image being used in the environment here. Expand the "Tools" section.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115607.png 'Click to enlarge'){data-modal=true}

5\. The tools section is for configuring the ingress rules NVIDIA run:AI will create for you when deploying from this environment. For example a URL for Jupyter Notebook or maybe a port for SSH connectivity with tools such as Pycharm or VSCode. Now expand the "Runtime settings"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115745.png 'Click to enlarge'){data-modal=true}

6\. This is where you can configure the startup command and arguments as well as any environment variables. This section is editable at the point of deployment too, allowing you to specify your own scripts etc. Select "Cancel" without making any changes.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115836.png 'Click to enlarge'){data-modal=true}

[Back to top](#table-of-contents)

#### Lesson 2: Compute Resource Assets

In this lesson you will learn what a compute resource asset is and what can be configured within it.

1\. Select "Compute resources" - A Compute resource is a block of compute, cpu, memory and gpu that can be allocated to a workload. Select the "small-fraction" resource.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20115940.png 'Click to enlarge'){data-modal=true}

2\. Click "Edit"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20120057.png 'Click to enlarge'){data-modal=true}

3\. Here you can see you can configure the amount of gpu, cpu and memory. For the GPU, when 1 device request is set, you can configure a percentage of the GPU. This allows you to run multiple workloads on a single GPU and can be very efficient for interactive IDE environments in particular.

4\. Scroll down and click "cancel"

Congratulations you have completed this lesson on the Compute Resource asset.

[Back to top](#table-of-contents)

#### Lesson 3: Data Source Asset

In this lesson you will learn what an data source asset is and what can be configured within it.

1\. Select "Data Sources" and then click "New Data Source"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20120159.png 'Click to enlarge'){data-modal=true}

2\. Here you can see all the different types of data sources you can add. Select "Git".

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20120241.png 'Click to enlarge'){data-modal=true}

3\. Click the green "Heirarchy Tree" icon next to the scope section here.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20120326.png 'Click to enlarge'){data-modal=true}

4\. For every asset, environments, compute resources or data sources, you can configure the scope, this defines which projects, departments, clusters etc can deploy which asset. Expand the runai section.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20120512.png 'Click to enlarge'){data-modal=true}

Tip! The runai scope level covers all clusters in the Nvidia run:AI control plane.

Tip! The scope level below runai is the cluster level, here you can select the specific clusters in scope for this asset.

5\. Expand the "default" department

Tip! This scope level is the department level, allowing you to set the scope of this asset to a particular department only.

6\. Select the project you created.

The last scope level is the project level, allowing you to set the scope of this asset to a particular project only.

7\. Click "Apply"

8\. Give the data source a name. e.g "genai-examples"

9\. Set the repo type to "Public", For the "Repository URL" field add "https://github.com/NVIDIA/GenerativeAIExamples.git" Click the "Revision (branch, tag or hash)" and type "main". Click the "Container path" field and Type "/home/demouser/github" (If this directory does not exist, please opena a terminal session and create it, mkdir /home/demouser/github/)

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-02%20120823.png 'Click to enlarge'){data-modal=true}

10\. Click "Create Data Source"

Congratulations you have completed this lesson on the Data Source asset.

[Back to top](#table-of-contents)

## Module 3: Deploying a workload

In this module you will deploy a workload and validate it.

**Use Case!** Now you've defined your assets or "service catalog" lets see how easy it is for an end user to deploy from them.

#### Lesson 1: Deploying a workload

In this lesson you will deploy a Workspace workload.

1\. Select "Workloads". Click "NEW WORKLOAD". We will create a workspace. Click "Workspace"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20162932.png 'Click to enlarge'){data-modal=true}

2\. Ensure your project is selected. (In our case we had a project called 'factory'

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20163229.png 'Click to enlarge'){data-modal=true}

**Tip!** If you hover over the blue box in the middle of your project you will see the current quota allocation within the project.

3\. Use a blank template, Give the workspace a name. Click "continue"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20163345.png 'Click to enlarge'){data-modal=true}

4\. Click the small icon with the arrow icon in the Environment section. You'll now notice you see all of the environments that have been made available to your project (remember the scope). Select the jupyter-example environment.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20163611.png 'Click to enlarge'){data-modal=true}

8\. Under the Environment section, see the image we are going to pull, Expand "Tools" and you'll see the ingress rule we will be creating for this environment. Next move to "Access" section, Select the pencil next to the "Access" field.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164008.png 'Click to enlarge'){data-modal=true}

9\. Here you can control permissions on who can access this workload. Leave on "All authenticated users" and Click "Cancel.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164239.png 'Click to enlarge'){data-modal=true}

**Tip!** NVIDIA run:AI can integrate with your own IDP/SSO system using SAML2.0 or OIDC. This makes permissions configuration here and with NVIDIA run:AI's RBAC easy.

10\. Expand "Runtime Settings
Here is where you can edit the startup commands, arguments and environment variables, as mentioned in the enviroment asset lesson. For example, if this was a training workload you would likely want to set your own training script to be called here.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164351.png 'Click to enlarge'){data-modal=true}

11\. Scroll down to "Compute Resource" section and again click the small arrow icon to load a preset compute resource template,

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164558.png 'Click to enlarge'){data-modal=true}

12\. From the pop-up selection, select the "small-fraction" Compute resource. This will give the workload a 10% fraction of a GPU.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164645.png 'Click to enlarge'){data-modal=true}

**Use Case!** As mentioned in Module 2, using a fraction of a GPU when suitable, rather than a whole one, means that less resource is wasted. For example, let's assume we have a need for 10x Jupyter Notebooks. Historically each notebook would consume an entire GPU each, requiring 10x GPUs, whilst utilising on average a very small percentage of that GPUs capability. This is very wasteful. With NVIDIA run:AI instead each Jupyter Notebook can be given 10% of a GPU for example, meaning only a single GPU is consumed to run 10 Jupyter Notebooks. In turn this means you now have 9x more GPUs for training and experiments, increasing productivity and utilization across the board.

12\. Scroll down to "Data Sources" section and again click the small arrow icon to load a preset Data Source template
Select the git data source you just created. "GenAI Examples". Click the "Load" button on the bottom right of the screen

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164903.png 'Click to enlarge'){data-modal=true}

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20164940.png 'Click to enlarge'){data-modal=true}

13\. Click "Create Workspace"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20165224.png 'Click to enlarge'){data-modal=true}

Congratulations you have just created your first workload. See how you only needed to know which tools, libraries & frameworks (environment) you needed, how much resource (compute resource) you needed and where your datasets and working directories were (data sources). All the complexities of Kubernetes is abstracted away by NVIDIA run:AI.

#### Lesson 2: Validating the Workload

In this lesson we will validate the workload by covering the troubleshooting options and checking the configuration in the workload itself.

1\. Select your new workload. Click "show details"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20165625.png 'Click to enlarge'){data-modal=true}

2\. Under the Event History section here you will see all the steps we are taking within Kubernetes. This can help you troubleshoot issues that arise before the container starts running.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20165746.png 'Click to enlarge'){data-modal=true}

3\. Once the workload is running, select "Logs"
Here you will see the container logs. This is useful to see what is happening within the container after the container has started. Now select "Metrics"

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20165823.png 'Click to enlarge'){data-modal=true}

4\. Here you will the metrics related to this workload over time. Now select "Details"
This will show you the commands, arguments and environment variables passed for this workload. Click the "X" to close the window.

![Image](/ImageProxy?filename=c3f18107-4487-4079-9218-092ba8976da5/Screenshot%202026-03-03%20165923.png 'Click to enlarge'){data-modal=true}

Congratulations you have successfully validated your first workload!

[Back to top](#table-of-contents)

## Summary

**NVIDIA run:AI Key Benefits:**

- Centralized AI platform management and consumption
- Provide your teams and end users resource guarantees whilst ensuring high utilization.
- Increase GPU density with GPU fractioning
- Completely automated workload scheduling, submit once knowing NVIDIA run:AI will ensure it completes in the shortest possible time.
- Deliver a completely customizable service catalog to your end teams
- This removes end users from infrastructure complexities
- Provides standardized end user consumption and deployment, increasing security and decreasing management overheads.

[Back to top](#table-of-contents)
